# Fix Spec: callback-hell.js

## Goal

Refactor deeply nested callbacks to async/await pattern to eliminate callback hell and fix error handling inconsistencies.

## Issues Found

1. **Callback hell/Pyramid of Doom**: Multiple levels of nested callbacks in `processUserData` making code hard to read and maintain
2. **Inconsistent async/await usage**: Mixing callbacks with `async/await` (line 56 uses `await` inside callback-based code)
3. **Incomplete function**: `initializeDatabase` function is truncated/incomplete
4. **Poor error handling**: Try-catch wrapping callbacks won't catch async errors; missing error handlers on https.get requests in nested callbacks
5. **Code duplication**: Repeated pattern of https.get with data chunking that could use the existing `httpsGet` helper

## Files to Edit

- `01-bugs-to-fix/javascript/callback-hell.js`

## Changes Required

### 1. Refactor `processUserData` to async/await

- Convert function signature from `function processUserData(userId, callback)` to `async function processUserData(userId)`
- Replace nested `https.get` callbacks with `httpsGet` helper function and `await`
- Replace `fs.writeFile` callback with `fs.promises.writeFile` and `await`
- Replace `fs.readFile` callback with `fs.promises.readFile` and `await`
- Remove all callback nesting - make sequential operations linear with await
- Replace `callback(error, null)` returns with `throw error`
- Replace `callback(null, result)` with `return result`
- Remove the try-catch wrapper (let async errors propagate naturally)

### 2. Fix fs module import

- Add `const fsPromises = require('fs').promises;` or use `fs/promises` for promise-based file operations

### 3. Complete or remove `initializeDatabase` function

- Either implement it fully using async/await pattern, or remove it entirely as it's incomplete
- If implementing, convert to: `async function initializeDatabase(config)` with proper await calls

### 4. Add usage example

- Update or add example usage showing async/await invocation with try-catch:
  ```javascript
  (async () => {
    try {
      const result = await processUserData(123);
      console.log(result);
    } catch (error) {
      console.error(error);
    }
  })();
  ```
