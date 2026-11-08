import { describe, it, expect } from "vitest";
import { decodeHtml } from "./dispatcher.server";

/**
 * Regression fixtures captured from real GTX Free (translate-pa) responses,
 * plus adversarial XSS-shaped payloads. `decodeHtml` MUST:
 *  - Never emit `<` or `>` (no raw tags can survive into rendered output).
 *  - Never emit `javascript:` URLs or `on*=` event handlers as live markup.
 *  - Decode common named + numeric entities.
 *  - Preserve inner text of wrapper tags (<i>, <b>, <span>, <font>, ...).
 */

const GTX_REAL_SAMPLES: Array<{ name: string; input: string; expected: string }> = [
  {
    name: "italic wrapper around proper noun (Sijjin)",
    input: "&quot;<i>Sijjin</i>&quot;",
    expected: '"Sijjin"',
  },
  {
    name: "encoded apostrophe (Ratu')",
    input: "Ratu&#39;",
    expected: "Ratu'",
  },
  {
    name: "encoded apostrophe (It's)",
    input: "It&#39;s",
    expected: "It's",
  },
  {
    name: "nested bold + italic with attributes",
    input: '<b class="x"><i lang="en">Hello</i></b>',
    expected: "Hello",
  },
  {
    name: "<br> becomes newline",
    input: "line1<br>line2<br/>line3<BR />line4",
    expected: "line1\nline2\nline3\nline4",
  },
  {
    name: "span/font wrappers preserve inner text",
    input: '<span style="color:red">red</span> and <font color="blue">blue</font>',
    expected: "red and blue",
  },
  {
    name: "hex + decimal numeric entities",
    input: "caf&#xe9; &#233; &#x2014; em-dash",
    expected: "café é — em-dash",
  },
  {
    name: "double-encoded entities (&amp;lt; → <)",
    input: "5 &amp;lt; 10 &amp;amp;&amp;amp; 10 &amp;gt; 5",
    expected: "5 < 10 && 10 > 5",
  },
  {
    name: "named entities (nbsp, mdash, smart quotes)",
    input: "He said&nbsp;&ldquo;hi&rdquo;&mdash;then left.",
    expected: 'He said \u201Chi\u201D—then left.',
  },
  {
    name: "currency + symbols",
    input: "&pound;5 &euro;6 &yen;7 &copy;2024 &reg; &trade;",
    expected: "£5 €6 ¥7 ©2024 ® ™",
  },
];

const XSS_SAMPLES: Array<{ name: string; input: string }> = [
  { name: "script tag", input: "<script>alert(1)</script>hello" },
  { name: "script with attrs", input: '<script src="//evil.com/x.js"></script>safe' },
  { name: "img onerror", input: '<img src=x onerror="alert(1)">caption' },
  { name: "svg onload", input: '<svg onload=alert(1)>x</svg>' },
  { name: "iframe", input: '<iframe src="javascript:alert(1)"></iframe>ok' },
  { name: "anchor with javascript:", input: '<a href="javascript:alert(1)">click</a>' },
  { name: "encoded script tag (not decoded into live html)", input: "&lt;script&gt;alert(1)&lt;/script&gt;" },
  { name: "style/expression", input: '<style>body{background:url(javascript:alert(1))}</style>x' },
  { name: "mixed wrapper + script", input: '<i>safe</i><script>bad()</script><b>also safe</b>' },
  { name: "malformed unterminated tag", input: '<i unterminated attr="><script>alert(1)</script>' },
  { name: "data URI in img", input: '<img src="data:text/html,<script>alert(1)</script>">x' },
];

describe("decodeHtml — GTX Free regression fixtures", () => {
  for (const { name, input, expected } of GTX_REAL_SAMPLES) {
    it(name, () => {
      expect(decodeHtml(input)).toBe(expected);
    });
  }
});

describe("decodeHtml — XSS/markup containment", () => {
  for (const { name, input } of XSS_SAMPLES) {
    it(`strips all markup: ${name}`, () => {
      const out = decodeHtml(input);
      // No raw HTML tag delimiters may survive.
      expect(out).not.toMatch(/<[a-zA-Z!\/]/);
      expect(out).not.toMatch(/<\/[a-zA-Z]/);
      // No live event handlers or javascript: URLs.
      expect(out.toLowerCase()).not.toMatch(/\bon[a-z]+\s*=/);
      expect(out.toLowerCase()).not.toContain("javascript:");
      // Decoded `&lt;script&gt;` payload must also be inert (decoded `<` is OK
      // as plain text but no full tag pattern should remain).
      expect(out).not.toMatch(/<script\b/i);
    });
  }

  it("preserves benign inner text when stripping <script>", () => {
    expect(decodeHtml("<script>bad()</script>hello")).toBe("hello");
  });

  it("is idempotent", () => {
    const sample = '&amp;lt;b&amp;gt;x&amp;lt;/b&amp;gt; <i>y</i> &#x26;amp;';
    const once = decodeHtml(sample);
    const twice = decodeHtml(once);
    expect(twice).toBe(once);
  });

  it("handles empty / nullish input", () => {
    expect(decodeHtml("")).toBe("");
    expect(decodeHtml(null)).toBe("");
    expect(decodeHtml(undefined)).toBe("");
  });
});
