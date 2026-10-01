#!/usr/bin/env node
// Generate the ADMIN_PASSWORD_HASH secret for the admin login.
// Usage: npm run hash-password   (you'll be asked for the password; it isn't shown)
import readline from "node:readline";
import { hashPassword } from "../src/lib/crypto.ts";

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) rl.output.write(s); // show the prompt, hide the typing
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = process.argv[2] ?? (await askHidden("Password for the admin login: "));
if (!password || password.length < 10) {
  console.error("Please use a password of at least 10 characters.");
  process.exit(1);
}
console.log("\nADMIN_PASSWORD_HASH=" + (await hashPassword(password)));
