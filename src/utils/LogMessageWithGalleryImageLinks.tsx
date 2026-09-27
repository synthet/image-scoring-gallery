import { bridge } from '../bridge';
import { apiBaseUrlForExternalOpen } from './apiBaseUrlForBrowser';
import { splitLogMessageWithImageLinks } from './logMessageLinks';

async function openBackendImageInspector(id: number): Promise<void> {
    const config = await bridge.getApiConfig();
    const url = `${apiBaseUrlForExternalOpen(config)}/ui/images/${id}`;
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
