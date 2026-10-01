import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EvidenceLayerChips } from './EvidenceLayerChips';
import { DEFAULT_EVIDENCE_LAYERS } from '../../types/imageEvidence';

describe('EvidenceLayerChips', () => {
    it('toggles chips and respects gates', () => {
        const onToggle = vi.fn();
        render(
            <EvidenceLayerChips
                layers={DEFAULT_EVIDENCE_LAYERS}
                gates={{
                    region: true,
                    mask: false,
                    keypoints: false,
                    focus_grid: true,
                    noise_grid: true,
                }}
                onToggle={onToggle}
            />,
        );
        fireEvent.click(screen.getByTestId('evidence-chip-sharpness'));
        expect(onToggle).toHaveBeenCalledWith('sharpness');
        expect(screen.getByTestId('evidence-chip-mask')).toHaveProperty('disabled', true);
    });
});
