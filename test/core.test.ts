import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPacketFromFiles, inspectRegisteredRoot, readRegisteredFile, scanRegisteredRoot, searchContent, searchFiles } from "../src/core.js";
import { addRoot, listRoots } from "../src/roots/registry.js";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeText(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

beforeEach(() => {
  process.env.CLAUDE_LOCAL_MCP_HOME = makeTempDir("claude-local-state-");
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.CLAUDE_LOCAL_MCP_HOME;
});

describe("Claude Local MCP core", () => {
  it("registers roots, inspects scale, scans index, searches, and reads text with citations", () => {
    const project = makeTempDir("claude-local-project-");
    writeText(project, "README.md", "# Demo\n\nThis repo explains Claude Local MCP.\n");
    writeText(project, "src/index.ts", "export const marker = 'Claude Local MCP';\n");
    writeText(project, "node_modules/ignored.txt", "should not be scanned\n");

    const root = addRoot(project, "DemoRoot");
    expect(root.root_id).toBe("DemoRoot");
    expect(listRoots()).toHaveLength(1);

    const inspection = inspectRegisteredRoot("DemoRoot");
    expect(inspection.tier).toBe("tiny");
    expect(inspection.sample_entries.some((entry) => entry.path === "README.md")).toBe(true);
    expect(inspection.sample_entries.some((entry) => entry.path.includes("node_modules"))).toBe(false);

    const scan = scanRegisteredRoot("DemoRoot", { maxEntries: 1000 });
    expect(scan.indexed_entries).toBeGreaterThan(0);

    const fileSearch = searchFiles("DemoRoot", "README");
    expect(fileSearch.matches.map((match) => match.path)).toContain("README.md");

    const contentSearch = searchContent("DemoRoot", "marker");
    expect(contentSearch.matches[0]).toMatchObject({ path: "src/index.ts", line: 1 });

    const read = readRegisteredFile("DemoRoot", "README.md");
    expect(read.understanding_status).toBe("complete");
    expect(read.chunks[0].citation).toBe("README.md:1-4");
    expect(read.chunks[0].text).toContain("Claude Local MCP");
  });

  it("blocks sensitive files until explicitly confirmed and builds context packets", () => {
    const project = makeTempDir("claude-local-sensitive-");
    writeText(project, "safe.txt", "Safe context.\n");
    writeText(project, ".env", "OPENAI_API_KEY=sk-test-secret-value-that-should-redact\n");
    addRoot(project, "SecureRoot");

    const blocked = readRegisteredFile("SecureRoot", ".env");
    expect(blocked.understanding_status).toBe("blocked_confirmation_required");
    expect(blocked.chunks).toHaveLength(0);

    const confirmed = readRegisteredFile("SecureRoot", ".env", { confirmSensitive: true });
    expect(confirmed.redacted).toBe(true);
    expect(confirmed.chunks[0].text).toContain("[REDACTED]");

    const packet = buildPacketFromFiles("SecureRoot", ["safe.txt", ".env"], { query: "review", budget: 12000 });
    expect(packet.files_read).toEqual(["safe.txt"]);
    expect(packet.files_skipped[0]).toMatchObject({ path: ".env", reason: "sensitive_confirmation_required" });
    expect(packet.content).toContain("Safe context.");
  });

  it("extracts basic Office OpenXML text and archive entry listings", () => {
    const project = makeTempDir("claude-local-office-");
    const docx = new AdmZip();
    docx.addFile(
      "word/document.xml",
      Buffer.from(
        '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Quarterly MCP plan</w:t></w:r></w:p></w:body></w:document>',
        "utf8"
      )
    );
    docx.writeZip(path.join(project, "plan.docx"));

    const archive = new AdmZip();
    archive.addFile("notes/readme.txt", Buffer.from("inside archive", "utf8"));
    archive.writeZip(path.join(project, "bundle.zip"));

    addRoot(project, "OfficeRoot");
    const officeRead = readRegisteredFile("OfficeRoot", "plan.docx");
    expect(officeRead.file_type).toBe("office");
    expect(officeRead.understanding_status).toBe("complete");
    expect(officeRead.chunks[0].text).toContain("Quarterly MCP plan");
    expect(officeRead.metadata.parts).toContain("word/document.xml");

    const archiveRead = readRegisteredFile("OfficeRoot", "bundle.zip");
    expect(archiveRead.file_type).toBe("archive");
    expect(archiveRead.chunks[0].text).toContain("notes/readme.txt");
  });
});
