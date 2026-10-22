import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const PROJECT = "bubbas-closet";
const token = execSync("gcloud auth print-access-token", {
  encoding: "utf8",
}).trim();

function unwrap(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(unwrap);
  if ("mapValue" in v) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {}))
      out[k] = unwrap(val);
    return out;
  }
  return v;
}

async function listCollection(name) {
  const docs = [];
  let pageToken = "";
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${name}`,
    );
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
    const body = await res.json();
    for (const doc of body.documents ?? []) {
      const id = doc.name.split("/").pop();
      const fields = {};
      for (const [k, val] of Object.entries(doc.fields ?? {}))
        fields[k] = unwrap(val);
      docs.push({ id, ...fields });
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return docs;
}

mkdirSync("exports", { recursive: true });
for (const name of ["products", "units"]) {
  const rows = await listCollection(name);
  writeFileSync(`exports/${name}.json`, JSON.stringify(rows, null, 2));
  console.log(`${name}: ${rows.length}`);
}
