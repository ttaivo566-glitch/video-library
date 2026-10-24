const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

function pick(html, names) {
  for (const n of names) {
    const a = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html);
    if (a && a[1]) return decode(a[1]);
    const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, 'i').exec(html);
    if (b && b[1]) return decode(b[1]);
  }
  return '';
}

module.exports = async (req, res) => {
  const pass = process.env.APP_PASSWORD;
  if (!pass || req.headers['x-pass'] !== pass) return res.status(401).json({ error: 'unauthorized' });

  const out = { title: '', thumb: '', embeddable: true };
  const url = req.query.url;
  try { new URL(url); } catch { return res.status(200).json(out); }

  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'vi,en;q=0.8',
      },
    });

    const xfo = (r.headers.get('x-frame-options') || '').toLowerCase();
    const fa = /frame-ancestors\s+([^;]+)/i.exec(r.headers.get('content-security-policy') || '');
    if (xfo.includes('deny') || xfo.includes('sameorigin') || (fa && fa[1].trim() !== '*')) out.embeddable = false;

    const type = r.headers.get('content-type') || '';
    if (type.includes('text/html')) {
      const html = (await r.text()).slice(0, 400000);
      let title = pick(html, ['og:title', 'twitter:title']);
      if (!title) { const t = /<title[^>]*>([^<]*)<\/title>/i.exec(html); if (t) title = decode(t[1]); }
      if (/^(just a moment|attention required|access denied|403|404)/i.test(title)) title = '';
      out.title = title;
      const img = pick(html, ['og:image', 'og:image:url', 'twitter:image']);
      if (img) { try { out.thumb = new URL(img, r.url).href; } catch {} }
    }
  } catch { /* trả về mặc định */ }

  return res.status(200).json(out);
};
