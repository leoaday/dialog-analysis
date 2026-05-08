import open from "open";

export async function openInBrowser(url) {
  try {
    const sub = await open(url);
    return sub;
  } catch (e) {
    process.stderr.write(`failed to open browser: ${e.message}\n`);
    return null;
  }
}
