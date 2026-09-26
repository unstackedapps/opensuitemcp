import { ImageResponse } from "next/og";

/**
 * The install's opaque icon.
 *
 * icon.svg and favicon.ico are transparent, which is right for a browser tab
 * and wrong everywhere a client drops the image onto a tile of its own
 * choosing — a transparent logo on a light tile is how OpenSuiteMCP ended up
 * as two speech bubbles floating on white inside a dark connector list.
 *
 * This one carries its own background, so it looks the same wherever it lands.
 * The MCP server points at it from `serverInfo.icons`, and the middleware lets
 * /apple-icon through unauthenticated — a client fetching it has no session and
 * no reason to have one.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0c1219",
        borderRadius: 36,
      }}
    >
      <div
        style={{
          display: "flex",
          position: "relative",
          width: 110,
          height: 110,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 8,
            top: 4,
            width: 70,
            height: 58,
            borderRadius: 14,
            backgroundColor: "#4a81e8",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 4,
            bottom: 8,
            width: 70,
            height: 58,
            borderRadius: 14,
            backgroundColor: "#ea580c",
          }}
        />
      </div>
    </div>,
    { ...size },
  );
}
