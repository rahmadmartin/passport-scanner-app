const { sanitize } = require('../renderer/formatters');

function runTests() {
  const tests = [
    ["John Doe", "John_Doe"],
    ["Ir. Danny_Budiharto, MBA", "Ir_Danny_Budiharto_MBA"],
    ["...John...", "John"],
  ];

  tests.forEach(([input, expected]) => {
    const result = sanitize(input);

    if (result === expected) {
      console.log("✅", input, result);
    } else {
      console.error("❌", input, "=>", result, "expected", expected);
    }
  });
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
