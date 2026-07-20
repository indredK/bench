import { describe, expect, it } from "vitest"
import {
  detectCardKind,
  suggestCardKind,
} from "@/features/command-center/services/detect-card-kind"

describe("detectCardKind", () => {
  it("detects admin commands via sudo", () => {
    expect(detectCardKind("sudo rm -rf /tmp/x")).toBe("shellAdmin")
  })

  it("detects admin commands via osascript administrator privileges", () => {
    expect(
      detectCardKind("osascript -e 'do shell script \"id\" with administrator privileges'"),
    ).toBe("shellAdmin")
  })

  it("detects URLs as open", () => {
    expect(detectCardKind("https://example.com")).toBe("open")
    expect(detectCardKind("file:///Users/me/notes.txt")).toBe("open")
  })

  it("detects plain paths as open", () => {
    expect(detectCardKind("~/Documents")).toBe("open")
    expect(detectCardKind("/Applications/Safari.app")).toBe("open")
    expect(detectCardKind("./build")).toBe("open")
  })

  it("detects common CLI tools as shell", () => {
    expect(detectCardKind("git log --oneline")).toBe("shell")
    expect(detectCardKind("docker compose up -d")).toBe("shell")
    expect(detectCardKind("npm run build")).toBe("shell")
  })

  it("detects shell syntax as shell", () => {
    expect(detectCardKind("cat a.txt | grep foo > out.txt")).toBe("shell")
    expect(detectCardKind("echo $HOME && ls")).toBe("shell")
  })

  it("does not treat a command path as open", () => {
    expect(detectCardKind("/bin/ls -la")).toBe("shell")
  })

  it("returns null for ambiguous plain text", () => {
    expect(detectCardKind("hello world")).toBeNull()
    expect(detectCardKind("")).toBeNull()
  })
})

describe("suggestCardKind", () => {
  it("falls back to shell when ambiguous", () => {
    expect(suggestCardKind("hello world")).toBe("shell")
  })

  it("keeps a confident detection", () => {
    expect(suggestCardKind("https://example.com")).toBe("open")
  })
})
