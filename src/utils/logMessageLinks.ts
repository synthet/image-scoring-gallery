const IMG_LINK_RE = /\[\[img:(\d+)\]\]/g;

export type ImageLinkSegment =
    | { kind: 'text'; text: string }
    | { kind: 'image'; id: number };

export function splitLogMessageWithImageLinks(message: string): ImageLinkSegment[] {
    if (!message || message.indexOf('[[img:') === -1) {
        return [{ kind: 'text', text: message }];
    }
    const out: ImageLinkSegment[] = [];
    let last = 0;
    const re = new RegExp(IMG_LINK_RE.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(message)) !== null) {
        if (m.index > last) {
            out.push({ kind: 'text', text: message.slice(last, m.index) });
        }
        const id = Number(m[1]);
        if (Number.isFinite(id) && id > 0) {
            out.push({ kind: 'image', id });
        } else {
            out.push({ kind: 'text', text: m[0] });
        }
        last = m.index + m[0].length;
    }
    if (last < message.length) {
        out.push({ kind: 'text', text: message.slice(last) });
    }
    return out.length ? out : [{ kind: 'text', text: message }];
}
