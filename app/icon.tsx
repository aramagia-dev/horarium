import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

function HorariumGlyph({ fontSize, radius }: { fontSize: number; radius: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#6558d8",
        borderRadius: radius,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ffffff",
          fontSize,
          fontWeight: 800,
          fontFamily: "Arial, sans-serif",
        }}
      >
        H
      </div>
    </div>
  );
}

export default function Icon() {
  return new ImageResponse(<HorariumGlyph fontSize={300} radius={112} />, {
    ...size,
  });
}
