#!/usr/bin/env node

/**
 * Generate Linux icon (PNG) from SVG source
 * 
 * This script generates a high-resolution PNG icon from the SVG source
 * for use in Linux .deb and .rpm packages.
 * 
 * Usage: node scripts/generate-linux-icon.mjs
 */

import sharp from "sharp";
import { resolve, dirname } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SVG_SOURCE = resolve(__dirname, "..", "client", "public", "mcp_jam.svg");
const OUTPUT_PATH = resolve(__dirname, "..", "assets", "icon.png");
const ICON_SIZE = 512;
const CONTENT_SCALE = 0.85; // Leave 15% padding for desktop environment icons

async function generateLinuxIcon() {
  console.log("[generate-linux-icon] Generating Linux PNG icon...");

  if (!existsSync(SVG_SOURCE)) {
    console.error(`[generate-linux-icon] SVG source not found: ${SVG_SOURCE}`);
    process.exit(1);
  }

  try {
    // Calculate the padded size
    const paddedSize = ICON_SIZE / CONTENT_SCALE;
    const offset = (paddedSize - ICON_SIZE) / 2;

    // Generate the icon
    await sharp(SVG_SOURCE)
      .resize({
        width: ICON_SIZE,
        height: ICON_SIZE,
        fit: "contain",
        position: "center",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .extend({
        top: Math.ceil(offset),
        bottom: Math.ceil(offset),
        left: Math.ceil(offset),
        right: Math.ceil(offset),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ quality: 90 })
      .toFile(OUTPUT_PATH);

    console.log(`[generate-linux-icon] ✓ Created: ${OUTPUT_PATH}`);
    console.log(`[generate-linux-icon]   Size: ${ICON_SIZE}x${ICON_SIZE}px`);
  } catch (error) {
    console.error("[generate-linux-icon] Error generating icon:", error);
    process.exit(1);
  }
}

generateLinuxIcon();