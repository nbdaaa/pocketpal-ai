/**
 * DocTags rendering — mirrors the server-side experiment app (experiment/app.py
 * `_fix_vn` + `_render`) so the on-device output is displayed exactly like the
 * serving UI: Vietnamese spacing tone-marks are recomposed, then the docling
 * element tags are converted to HTML and shown in a WebView. The model emits
 * `<text>/<section_header_level_N>/<list_item>/...` element tags with `<loc_*>`
 * coordinate tokens, and tables as literal HTML — react-native-markdown-display
 * swallows these tag-like tokens, hence the dedicated converter.
 */

// Spacing tone-marks → their combining equivalents; NFC then composes them
// ("Ô"+◌́ → "Ố", "ê"+◌̀ → "ề"). Mirrors _SPACING_TONE in experiment/app.py.
const SPACING_TONE: Record<string, string> = {
  '´': '́', // ´ acute (sắc)
  'ˊ': '́', // ˊ acute
  '`': '̀', // ` grave (huyền)
  'ˋ': '̀', // ˋ grave
  '˜': '̃', // ˜ tilde (ngã)
  'ˇ': '̉', // ˇ hook above (hỏi)
};

/** Mirror of experiment/app.py `_fix_vn`. */
export function fixVietnameseTones(text: string): string {
  const mapped = text.replace(/[´ˊ`ˋ˜ˇ]/g, c =>
    SPACING_TONE[c] !== undefined ? SPACING_TONE[c] : c,
  );
  return mapped.normalize('NFC');
}

/** True when the text looks like the model's DocTags output. */
export function isDocTags(text: string): boolean {
  return /<doctag>/.test(text) || /<loc_\d+>/.test(text);
}

const RENDER_CSS = `<style>
.doc-render{max-width:820px;margin:0 auto;padding:24px 28px;background:#fff;color:#1a1a1a;
  font-family:'Times New Roman',serif;line-height:1.55;box-shadow:0 1px 6px rgba(0,0,0,.15);}
.doc-render h1{font-size:1.5em;font-weight:700;margin:.2em 0 .6em;}
.doc-render h2,.doc-render h3{font-weight:700;margin:1em 0 .4em;}
.doc-render p{margin:.5em 0;text-align:justify;}
.doc-render p.cap{font-style:italic;}
.doc-render .meta{color:#666;font-size:.85em;}
.doc-render .fig{color:#888;font-style:italic;margin:.5em 0;}
.doc-render ul,.doc-render ol{margin:.5em 0 .5em 1.4em;}
.doc-render table{border-collapse:collapse;margin:.8em 0;width:100%;}
.doc-render th,.doc-render td{border:1px solid #bbb;padding:4px 8px;font-size:.9em;}
</style>`;

/**
 * Convert DocTags → styled HTML. Mirror of experiment/app.py `_render`
 * (Vietnamese tones are fixed first, matching the serving pipeline).
 */
export function doctagsToHtml(doctags: string): string {
  let s = fixVietnameseTones(doctags);
  s = s.replace(/<\/?doctag>/g, '');
  s = s.replace(/<loc_\d+>/g, ''); // drop coordinate tokens
  // collapse the <table> doctag wrapper around the inner HTML table
  s = s.replace(/<table>\s*(<table)/g, '$1');
  s = s.replace(/(<\/table>)\s*<\/table>/g, '$1');
  // element tags → HTML
  s = s.replace(
    /<section_header_level_\d+>([\s\S]*?)<\/section_header_level_\d+>/g,
    '<h3>$1</h3>',
  );
  s = s.replace(/<title>([\s\S]*?)<\/title>/g, '<h1>$1</h1>');
  s = s.replace(
    /<caption>([\s\S]*?)<\/caption>/g,
    '<p class="cap"><b>$1</b></p>',
  );
  s = s.replace(/<text>([\s\S]*?)<\/text>/g, '<p>$1</p>');
  s = s.replace(
    /<(page_header|page_footer)>([\s\S]*?)<\/\1>/g,
    '<div class="meta">$2</div>',
  );
  s = s.replace(/<unordered_list>([\s\S]*?)<\/unordered_list>/g, '<ul>$1</ul>');
  s = s.replace(/<ordered_list>([\s\S]*?)<\/ordered_list>/g, '<ol>$1</ol>');
  s = s.replace(/<list_item>([\s\S]*?)<\/list_item>/g, '<li>$1</li>');
  s = s.replace(/<picture>([\s\S]*?)<\/picture>/g, '<div class="fig">🖼 $1</div>');
  s = s.replace(/<\/?formula>/g, '');
  return RENDER_CSS + `<div class="doc-render">${s}</div>`;
}