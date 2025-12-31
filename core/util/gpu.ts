/**
 * GPU Detection Utility for Teddy.Codes
 *
 * Detects available GPU hardware for optimal local model selection.
 * Supports NVIDIA, AMD, and Apple Silicon detection.
 */

import { exec } from "child_process";
import * as os from "os";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface GPUInfo {
  vendor: "nvidia" | "amd" | "apple" | "intel" | "unknown";
  name: string;
  vram?: number; // in MB
  driver?: string;
  cudaVersion?: string;
  computeCapability?: string;
}

export interface SystemGPUInfo {
  gpus: GPUInfo[];
  totalVram: number;
  bestGpu: GPUInfo | null;
  recommendedQuantization: "q4" | "q5" | "q8" | "fp16";
  platform: NodeJS.Platform;
}

/**
 * Detect GPUs available on the system
 */
export async function detectGPUs(): Promise<SystemGPUInfo> {
  const platform = os.platform();
  const gpus: GPUInfo[] = [];

  try {
    if (platform === "darwin") {
      // macOS - check for Apple Silicon
      const appleGpu = await detectAppleSilicon();
      if (appleGpu) {
        gpus.push(appleGpu);
      }
    } else if (platform === "linux" || platform === "win32") {
      // Try NVIDIA first
      const nvidiaGpus = await detectNvidiaGPUs();
      gpus.push(...nvidiaGpus);

      // Try AMD if no NVIDIA found
      if (gpus.length === 0) {
        const amdGpus = await detectAMDGPUs();
        gpus.push(...amdGpus);
      }
    }
  } catch (e) {
    console.error("GPU detection error:", e);
  }

  const totalVram = gpus.reduce((sum, gpu) => sum + (gpu.vram || 0), 0);
  const bestGpu =
    gpus.length > 0
      ? gpus.reduce((best, gpu) =>
          (gpu.vram || 0) > (best.vram || 0) ? gpu : best,
        )
      : null;

  return {
    gpus,
    totalVram,
    bestGpu,
    recommendedQuantization: getRecommendedQuantization(totalVram),
    platform,
  };
}

/**
 * Detect Apple Silicon GPU
 */
async function detectAppleSilicon(): Promise<GPUInfo | null> {
  try {
    const { stdout } = await execAsync("sysctl -n machdep.cpu.brand_string");
    const cpuBrand = stdout.trim();

    if (cpuBrand.includes("Apple")) {
      // Get unified memory amount (shared between CPU and GPU)
      const { stdout: memStdout } = await execAsync("sysctl -n hw.memsize");
      const totalMemBytes = parseInt(memStdout.trim(), 10);
      const totalMemMB = Math.floor(totalMemBytes / (1024 * 1024));

      // Apple Silicon uses unified memory - GPU can use ~75% typically
      const gpuMemMB = Math.floor(totalMemMB * 0.75);

      // Detect chip type
      let chipType = "Apple Silicon";
      if (cpuBrand.includes("M1")) chipType = "Apple M1";
      else if (cpuBrand.includes("M2")) chipType = "Apple M2";
      else if (cpuBrand.includes("M3")) chipType = "Apple M3";
      else if (cpuBrand.includes("M4")) chipType = "Apple M4";

      // Check for Pro/Max/Ultra variants
      try {
        const { stdout: gpuCores } = await execAsync(
          "system_profiler SPDisplaysDataType | grep 'Total Number of Cores'",
        );
        const coreMatch = gpuCores.match(/(\d+)/);
        if (coreMatch) {
          const cores = parseInt(coreMatch[1], 10);
          if (cores >= 76) chipType += " Ultra";
          else if (cores >= 38) chipType += " Max";
          else if (cores >= 18) chipType += " Pro";
        }
      } catch {
        // Ignore if we can't detect variant
      }

      return {
        vendor: "apple",
        name: chipType,
        vram: gpuMemMB,
      };
    }
  } catch {
    // Not Apple Silicon or detection failed
  }

  return null;
}

/**
 * Detect NVIDIA GPUs using nvidia-smi
 */
async function detectNvidiaGPUs(): Promise<GPUInfo[]> {
  const gpus: GPUInfo[] = [];

  try {
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=name,memory.total,driver_version,compute_cap --format=csv,noheader,nounits",
    );

    const lines = stdout.trim().split("\n");
    for (const line of lines) {
      const [name, vram, driver, computeCap] = line
        .split(",")
        .map((s) => s.trim());

      if (name) {
        gpus.push({
          vendor: "nvidia",
          name,
          vram: parseInt(vram, 10) || undefined,
          driver,
          computeCapability: computeCap,
        });
      }
    }

    // Try to get CUDA version
    if (gpus.length > 0) {
      try {
        const { stdout: cudaStdout } = await execAsync(
          "nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1",
        );
        // CUDA version is typically shown in nvidia-smi header
        const { stdout: fullOutput } = await execAsync("nvidia-smi | head -3");
        const cudaMatch = fullOutput.match(/CUDA Version:\s*([\d.]+)/);
        if (cudaMatch) {
          gpus[0].cudaVersion = cudaMatch[1];
        }
      } catch {
        // Ignore CUDA version detection failure
      }
    }
  } catch {
    // nvidia-smi not available
  }

  return gpus;
}

/**
 * Detect AMD GPUs
 */
async function detectAMDGPUs(): Promise<GPUInfo[]> {
  const gpus: GPUInfo[] = [];

  try {
    // Try rocm-smi for ROCm-enabled systems
    const { stdout } = await execAsync(
      "rocm-smi --showproductname --showmeminfo vram --csv",
    );

    const lines = stdout.trim().split("\n");
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (parts.length >= 2) {
        gpus.push({
          vendor: "amd",
          name: parts[1]?.trim() || "AMD GPU",
          vram: parseInt(parts[2]?.trim() || "0", 10) || undefined,
        });
      }
    }
  } catch {
    // rocm-smi not available, try lspci on Linux
    if (os.platform() === "linux") {
      try {
        const { stdout } = await execAsync(
          "lspci | grep -i 'vga\\|3d\\|display' | grep -i amd",
        );
        const lines = stdout.trim().split("\n");
        for (const line of lines) {
          const match = line.match(/AMD.*?\[(.*?)\]/);
          if (match) {
            gpus.push({
              vendor: "amd",
              name: match[1] || "AMD GPU",
            });
          }
        }
      } catch {
        // No AMD GPU found
      }
    }
  }

  return gpus;
}

/**
 * Get recommended quantization based on available VRAM
 */
function getRecommendedQuantization(
  vramMB: number,
): "q4" | "q5" | "q8" | "fp16" {
  if (vramMB >= 24000) {
    // 24GB+ - can run FP16 models
    return "fp16";
  } else if (vramMB >= 16000) {
    // 16GB+ - Q8 is good balance
    return "q8";
  } else if (vramMB >= 8000) {
    // 8GB+ - Q5 for better quality
    return "q5";
  } else {
    // <8GB - stick with Q4
    return "q4";
  }
}

/**
 * Get model size recommendation based on GPU
 */
export function getRecommendedModelSize(gpuInfo: SystemGPUInfo): {
  maxParams: string;
  contextSize: number;
  notes: string;
} {
  const vram = gpuInfo.totalVram;

  if (vram >= 24000) {
    return {
      maxParams: "13B-70B",
      contextSize: 8192,
      notes: "High-end GPU. Can run large models with full context.",
    };
  } else if (vram >= 16000) {
    return {
      maxParams: "7B-13B",
      contextSize: 8192,
      notes: "Good for medium models. Consider Q8 quantization for quality.",
    };
  } else if (vram >= 8000) {
    return {
      maxParams: "7B",
      contextSize: 4096,
      notes: "Suitable for 7B models with Q4/Q5 quantization.",
    };
  } else if (vram >= 4000) {
    return {
      maxParams: "3B",
      contextSize: 2048,
      notes: "Limited VRAM. Use smaller models or heavy quantization.",
    };
  } else {
    return {
      maxParams: "1B-3B",
      contextSize: 2048,
      notes: "Very limited VRAM. Consider CPU inference or cloud models.",
    };
  }
}

/**
 * Quick check if system has a capable GPU
 */
export async function hasCapableGPU(): Promise<boolean> {
  const gpuInfo = await detectGPUs();
  // Consider 4GB+ as "capable" for local LLM inference
  return gpuInfo.totalVram >= 4000;
}

/**
 * Format GPU info for display
 */
export function formatGPUInfo(info: SystemGPUInfo): string {
  if (info.gpus.length === 0) {
    return "No GPU detected. CPU inference will be used.";
  }

  const lines: string[] = ["**GPU Information:**"];

  for (const gpu of info.gpus) {
    let line = `- ${gpu.name}`;
    if (gpu.vram) {
      line += ` (${(gpu.vram / 1024).toFixed(1)} GB VRAM)`;
    }
    if (gpu.driver) {
      line += ` [Driver: ${gpu.driver}]`;
    }
    lines.push(line);
  }

  lines.push("");
  lines.push(`Total VRAM: ${(info.totalVram / 1024).toFixed(1)} GB`);
  lines.push(
    `Recommended quantization: ${info.recommendedQuantization.toUpperCase()}`,
  );

  const modelRec = getRecommendedModelSize(info);
  lines.push(`Recommended model size: ${modelRec.maxParams}`);
  lines.push(`Max context: ${modelRec.contextSize} tokens`);

  return lines.join("\n");
}
