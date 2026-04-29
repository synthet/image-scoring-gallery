import { bridge } from '../bridge';

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

async function openBackendImageInspector(id: number): Promise<void> {
    const config = await bridge.getApiConfig();
    const url = `${config.url}/ui/images/${id}`;
    await bridge.openExternalUrl(url);
}

export function LogMessageWithGalleryImageLinks({ message }: { message: string }) {
    const segments = splitLogMessageWithImageLinks(message);
    return (
        <>
            {segments.map((s, i) =>
                s.kind === 'text' ? (
                    <span key={i}>{s.text}</span>
                ) : (
                    <button
                        key={i}
                        type="button"
                        onClick={() => void openBackendImageInspector(s.id).catch((err) => {
                            console.error('[LogMessageWithGalleryImageLinks]', err);
                        })}
                        style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            margin: 0,
                            cursor: 'pointer',
                            color: '#4fc1ff',
                            textDecoration: 'underline',
                            fontWeight: 600,
                            font: 'inherit',
                            display: 'inline',
                        }}
                        title={`Open image ${s.id} in backend`}
                    >
                        #{s.id}
                    </button>
                ),
            )}
        </>
    );
}
