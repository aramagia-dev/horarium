import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#6558d8",
          borderRadius: 40,
          color: "#ffffff",
          fontSize: 106,
          fontWeight: 800,
          fontFamily: "Arial, sans-serif",
        }}
      >
        H
      </div>
    ),
    { ...size },
  );
}
