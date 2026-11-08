const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

test('Android keeps subtitle filenames and caps long export names at 180 characters', () => {
  const source = fs.readFileSync(path.join(__dirname, 'src/app/subtitleos/MainActivity.java'), 'utf8');
  const method = source.slice(source.indexOf('    private String safeFilename('), source.indexOf('    private void grantAllowed('));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'subtitleos-filename-'));
  const javaHome = process.env.JAVA_HOME;
  assert.ok(javaHome, 'JAVA_HOME must point to the packaging JDK');
  try {
    fs.writeFileSync(path.join(temp, 'FilenameCheck.java'), `class FilenameCheck { ${method} public static void main(String[] args) { FilenameCheck c=new FilenameCheck(); System.out.println(c.safeFilename("Urdu.srt","text/plain")); System.out.println(c.safeFilename("bad/name.vtt","text/vtt")); System.out.println(c.safeFilename("a".repeat(200)+".mp4","video/mp4")); System.out.println(c.safeFilename("a".repeat(200),"text/plain")); } }`);
    execFileSync(path.join(javaHome, 'bin/javac'), [path.join(temp, 'FilenameCheck.java')]);
    const results = execFileSync(path.join(javaHome, 'bin/java'), ['-cp', temp, 'FilenameCheck'], { encoding: 'utf8' }).trim().split('\n');
    assert.equal(results[0], 'Urdu.srt');
    assert.equal(results[1], 'bad_name.vtt');
    assert.equal(results[2].length, 180);
    assert.equal(results[2].endsWith('.mp4'), true);
    assert.equal(results[3].length, 180);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});