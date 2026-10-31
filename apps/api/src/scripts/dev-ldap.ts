/** Starts the mock Active Directory on port 3890 with one account per demo employee. */
import { startDirectory } from "../ldap-directory";
import { DEMO_DIRECTORY } from "./demo-data";

startDirectory(DEMO_DIRECTORY, { port: 3890, servicePassword: process.env.LDAP_BIND_PASSWORD ?? "svc-password" }).then(({ url }) => {
  console.log(`Mock Active Directory listening on ${url} with ${DEMO_DIRECTORY.length} accounts`);
  console.log("Try: anna.schmidt / kompass (admin), jonas.weber / kompass (HR), lea.fischer / kompass (sales)");
});
