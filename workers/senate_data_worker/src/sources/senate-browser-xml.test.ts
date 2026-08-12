import { describe, expect, it, vi } from "vitest";
import {
  assertSenateGovLisUrl,
  extractSenateXmlFromBrowserContent,
  fetchSenateXmlViaBrowser,
  type SenateBrowserBinding,
} from "./senate-browser-xml";

const rawMenu = `<?xml version="1.0"?><vote_summary>
  <congress>119</congress>
  <session>2</session>
  <votes><vote><vote_number>00228</vote_number></vote></votes>
</vote_summary>`;

const wrappedMenu = `<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>
<div id="webkit-xml-viewer-source-xml"><vote_summary xmlns="">
  <congress>119</congress>
  <session>2</session>
  <votes><vote><vote_number>00228</vote_number></vote></votes>
</vote_summary></div>
</body></html>`;

describe("assertSenateGovLisUrl", () => {
  it("accepts Senate LIS menu and roll-call paths", () => {
    expect(
      assertSenateGovLisUrl(
        "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml"
      ).pathname
    ).toContain("vote_menu_119_2.xml");
    expect(
      assertSenateGovLisUrl(
        "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00228.xml"
      ).pathname
    ).toContain("00228");
  });

  it("rejects non-https, wrong host, or non-LIS paths", () => {
    expect(() => assertSenateGovLisUrl("http://www.senate.gov/legislative/LIS/roll_call_lists/x.xml")).toThrow(
      /https/i
    );
    expect(() => assertSenateGovLisUrl("https://evil.example/x.xml")).toThrow(/host/i);
    expect(() => assertSenateGovLisUrl("https://www.senate.gov/index.htm")).toThrow(/path/i);
  });
});

describe("extractSenateXmlFromBrowserContent", () => {
  it("returns raw XML unchanged", () => {
    expect(extractSenateXmlFromBrowserContent(rawMenu)).toBe(rawMenu);
  });

  it("extracts XML from Chromium XML-viewer HTML", () => {
    const xml = extractSenateXmlFromBrowserContent(wrappedMenu);
    expect(xml.startsWith("<vote_summary")).toBe(true);
    expect(xml).toContain("00228");
    expect(xml).not.toContain("webkit-xml-viewer");
  });

  it("accepts single-quoted viewer id attributes", () => {
    const html = wrappedMenu.replace(
      'id="webkit-xml-viewer-source-xml"',
      "id='webkit-xml-viewer-source-xml'"
    );
    expect(extractSenateXmlFromBrowserContent(html)).toContain("00228");
  });

  it("rejects empty or non-XML browser payloads", () => {
    expect(() => extractSenateXmlFromBrowserContent("")).toThrow(/empty/i);
    expect(() => extractSenateXmlFromBrowserContent("<html><body>nope</body></html>")).toThrow(
      /extractable/i
    );
  });
});

describe("fetchSenateXmlViaBrowser", () => {
  it("calls quickAction content and extracts XML", async () => {
    const browser: SenateBrowserBinding = {
      quickAction: vi.fn(async () =>
        Response.json({ success: true, result: wrappedMenu })
      ),
    };

    const xml = await fetchSenateXmlViaBrowser(
      browser,
      "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml"
    );

    expect(xml).toContain("<vote_summary");
    expect(xml).toContain("00228");
    expect(browser.quickAction).toHaveBeenCalledWith(
      "content",
      expect.objectContaining({
        url: "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml",
      })
    );
  });

  it("does not call quickAction for disallowed URLs", async () => {
    const browser: SenateBrowserBinding = {
      quickAction: vi.fn(async () => Response.json({ success: true, result: rawMenu })),
    };
    await expect(
      fetchSenateXmlViaBrowser(browser, "https://evil.example/x.xml")
    ).rejects.toThrow(/host/i);
    expect(browser.quickAction).not.toHaveBeenCalled();
  });

  it("throws when Browser Rendering HTTP or envelope fails", async () => {
    const httpFail: SenateBrowserBinding = {
      quickAction: vi.fn(async () => new Response("busy", { status: 429 })),
    };
    await expect(
      fetchSenateXmlViaBrowser(
        httpFail,
        "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml"
      )
    ).rejects.toThrow(/429/);

    const envelopeFail: SenateBrowserBinding = {
      quickAction: vi.fn(async () => Response.json({ success: false, errors: ["nope"] })),
    };
    await expect(
      fetchSenateXmlViaBrowser(
        envelopeFail,
        "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml"
      )
    ).rejects.toThrow(/unsuccessful/i);
  });
});
