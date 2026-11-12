// Renames an actor in the history, once, by hand: for an instance that comes from the login proxy (up to 0.16), whose
// steps say `marcel` where steps from now on say the address. The history is otherwise never rewritten; this changes
// only the actor's text, `marcel` and `marcel via <client>` alike, and nothing else. Stop noticebox first:
//   docker compose stop noticebox
//   docker compose run --rm noticebox node scripts/rename-actor.mjs marcel marcel@example.org
//   docker compose start noticebox
// Without --yes it only counts what it would change.
import Database from "better-sqlite3";

const args = process.argv.slice(2).filter((a) => a !== "--yes");
const apply = process.argv.includes("--yes");
const [from, to] = args;
const file = process.env.NOTICEBOX_DB || "data/noticebox.sqlite";
if (!from || !to || args.length !== 2) {
  console.error("usage: node scripts/rename-actor.mjs <old name> <new name> [--yes]");
  process.exit(2);
}
if (from === "form" || to === "form") {
  console.error("`form` is intake's name and is never renamed");
  process.exit(2);
}

const db = new Database(file, { fileMustExist: true });
db.pragma("busy_timeout = 5000");
const prefix = `${from} via `;
const count = () => db.prepare("select count(*) as n from events where actor = ? or substr(actor, 1, length(?)) = ?").get(from, prefix, prefix).n;
const n = count();
if (!apply) {
  console.log(`${file}: ${n} step(s) recorded as "${from}" or "${prefix}…" would say "${to}" instead; add --yes to rename them`);
  process.exit(0);
}
db.transaction(() => {
  db.prepare("update events set actor = ? where actor = ?").run(to, from);
  db.prepare("update events set actor = ? || substr(actor, length(?) + 1) where substr(actor, 1, length(?)) = ?").run(`${to} via `, prefix, prefix, prefix);
})();
console.log(`${file}: renamed ${n} step(s) from "${from}" to "${to}"`);
db.close();
