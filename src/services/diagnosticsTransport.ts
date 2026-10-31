import { bridge } from '../bridge';
import type { DiagnosticTransport } from '../types/diagnostics';

export const diagnosticsTransport: DiagnosticTransport = {
    manifest: imageId => bridge.getDiagnosticManifest(imageId),
    request: (imageId, layers, refresh) => bridge.requestDiagnostics(imageId, layers, refresh),
    cancel: (imageId, requestId) => bridge.cancelDiagnostics(imageId, requestId),
    artifact: (imageId, artifactId) => bridge.getDiagnosticArtifact(imageId, artifactId),
};
