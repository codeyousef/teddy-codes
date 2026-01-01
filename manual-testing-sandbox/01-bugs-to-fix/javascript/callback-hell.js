// BUG FILE: Callback hell for refactoring to async/await

const fs = require("fs");
const https = require("https");
const fsPromises = require("fs").promises;

// Helper function to wrap https.get in a Promise
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
        res.on("error", (err) => {
          reject(err);
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

// BUG: Deeply nested callbacks - "Pyramid of Doom"
async function processUserData(userId, callback) {
  try {
    // Level 1: Fetch user
    const user = await httpsGet(`https://api.example.com/users/${userId}`);

    // Level 2: Fetch user's orders
    const orders = await httpsGet(
      `https://api.example.com/users/${userId}/orders`,
    );

    // Level 3: Fetch details for each order in parallel
    const orderDetails = await Promise.all(
      orders.map((order) =>
        httpsGet(`https://api.example.com/orders/${order.id}`),
      ),
    );

    // Level 4: When all done, save to file
    const result = {
      user: user,
      orders: orderDetails,
    };

    await fsPromises.writeFile(
      `user_${userId}_data.json`,
      JSON.stringify(result, null, 2),
    );

    // Level 5: Read it back to verify
    const data = await fsPromises.readFile(`user_${userId}_data.json`, "utf8");
    callback(null, JSON.parse(data));
  } catch (error) {
    callback(error, null);
  }
}

// Another callback hell example: Sequential operations
function initializeDatabase(config, callback) {
  connectToDatabase(config, (err, connection) => {
    if (err) return callback(err);

    createTables(connection, (err) => {
      if (err) return callback(err);

      seedInitialData(connection, (err) => {
        if (err) return callback(err);

        createIndexes(connection, (err) => {
          if (err) return callback(err);

          verifySetup(connection, (err) => {
            if (err) return callback(err);

            callback(null, connection);
          });
        });
      });
    });
  });
}

// Mock functions for the above
function connectToDatabase(config, callback) {
  setTimeout(() => callback(null, { connected: true }), 100);
}

function createTables(connection, callback) {
  setTimeout(() => callback(null), 100);
}

function seedInitialData(connection, callback) {
  setTimeout(() => callback(null), 100);
}

function createIndexes(connection, callback) {
  setTimeout(() => callback(null), 100);
}

function verifySetup(connection, callback) {
  setTimeout(() => callback(null), 100);
}

// Usage example:
(async () => {
  try {
    processUserData(123, (error, result) => {
      if (error) {
        console.error("Error processing user data:", error);
      } else {
        console.log("User data processed successfully:", result);
      }
    });
  } catch (error) {
    console.error("Unexpected error:", error);
  }
})();
