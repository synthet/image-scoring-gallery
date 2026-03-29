import React from 'react';

interface SelectionSettingsProps {
  smartCoverEnabled: boolean;
  onSmartCoverChange: (enabled: boolean) => void;
}

export const SelectionSettings: React.FC<SelectionSettingsProps> = ({
  smartCoverEnabled,
  onSmartCoverChange,
}) => {
  return (
    <section>
      <h3 style={{ margin: '0 0 8px', fontSize: '1em', color: '#e0e0e0' }}>Selection</h3>
      <div style={{ fontSize: '0.85em', color: '#999', marginBottom: 12 }}>
        Tune stack cover selection behavior.
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          border: '1px solid #3e3e3e',
          borderRadius: 6,
          background: '#2a2a2a',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, color: '#ddd' }}>Smart Cover</div>
          <div style={{ fontSize: '0.85em', color: '#9a9a9a' }}>
            Prefer representative stack covers when available.
          </div>
        </div>
        <input
          type="checkbox"
          checked={smartCoverEnabled}
          onChange={(e) => onSmartCoverChange(e.target.checked)}
          aria-label="Enable Smart Cover"
        />
      </label>
    </section>
  );
};
