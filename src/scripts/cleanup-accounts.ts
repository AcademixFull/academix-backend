import { accountCleanupWorker } from "../services/account-deletion.runtime";

// One bounded sweep. An external persistent scheduler invokes this command.
accountCleanupWorker.run().then((result) => {
  console.log(JSON.stringify({ event: "account_cleanup_sweep", ...result }));
  if (result.failed) process.exitCode = 1;
}).catch(() => {
  console.error(JSON.stringify({ event: "account_cleanup_unavailable" }));
  process.exitCode = 1;
});
