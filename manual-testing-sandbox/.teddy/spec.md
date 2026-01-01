# Implementation Spec: Rewrite Calculator in TypeScript

## 1. Goal

Convert the JavaScript Calculator class to TypeScript with proper typing and compile configuration.

## 2. Files to Create

- **`calculator.ts`** - TypeScript version of Calculator class with type annotations
- **`tsconfig.json`** - TypeScript compiler configuration
- **`package.json`** - Project dependencies (typescript)

## 3. Key Code

**calculator.ts:**

```typescript
class Calculator {
  private result: number;

  constructor() {
    this.result = 0;
  }

  add(number: number): Calculator {
    this.result += number;
    return this;
  }

  subtract(number: number): Calculator {
    this.result -= number;
    return this;
  }

  multiply(number: number): Calculator {
    this.result *= number;
    return this;
  }

  divide(number: number): Calculator {
    if (number === 0) {
      throw new Error("Cannot divide by zero");
    }
    this.result /= number;
    return this;
  }

  getResult(): number {
    return this.result;
  }

  reset(): Calculator {
    this.result = 0;
    return this;
  }
}

export default Calculator;
```

**tsconfig.json:**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true
  }
}
```
