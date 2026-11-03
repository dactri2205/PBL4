import { pool } from "../db/pool.js";
import { setUserPassword } from "../repositories/account-repository.js";

function readSecret(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function")
    throw new Error("Run this command in an interactive terminal.");

  return new Promise((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    const restore = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          restore();
          process.stdout.write("\n");
          reject(new Error("Cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          restore();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    };
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.resume();
    input.on("data", onData);
  });
}

async function main() {
  const username = String(process.argv[2] || "").trim();
  if (!/^[-a-zA-Z0-9_.]{3,32}$/.test(username))
    throw new Error("Usage: npm run set-password -- <username>");

  const password = await readSecret("Mật khẩu mới (tối thiểu 12 ký tự): ");
  if (
    Array.from(password).length < 12 ||
    Buffer.byteLength(password, "utf8") > 1024
  )
    throw new Error("Mật khẩu cần ít nhất 12 ký tự và không quá 1024 byte.");
  const confirmation = await readSecret("Nhập lại mật khẩu: ");
  if (password !== confirmation) throw new Error("Mật khẩu nhập lại không khớp.");

  const changedUsername = await setUserPassword(username, password);
  console.log(`Đã cập nhật mật khẩu cho ${changedUsername}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
