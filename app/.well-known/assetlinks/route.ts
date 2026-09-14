// Serves /.well-known/assetlinks.json for the Android TWA wrapper.
// Fill ANDROID_SHA256_FINGERPRINT (comma-separated if several) and
// ANDROID_PACKAGE_NAME in Vercel env vars once the Play Console signing
// key exists. Without them this route returns 404 and the TWA shows the
// URL bar — the app still works, it just isn't verified yet.
export function GET() {
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINT ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const packageName = process.env.ANDROID_PACKAGE_NAME ?? "dev.horarium.twa";

  if (fingerprints.length === 0) {
    return Response.json(
      { error: "ANDROID_SHA256_FINGERPRINT not configured" },
      { status: 404 },
    );
  }

  return Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
}
