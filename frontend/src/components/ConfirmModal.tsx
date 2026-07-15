import React from "react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText: string;
  cancelText?: string;
  isLoading?: boolean;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText,
  cancelText = "Cancel",
  isLoading = false,
  isDanger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="remove-modal-overlay">
      <div className="remove-modal-box">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="remove-modal-actions">
          <button onClick={onCancel} className="cancel-btn" disabled={isLoading}>
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="confirm-btn"
            disabled={isLoading}
            style={isDanger ? { backgroundColor: "#dc2626", borderColor: "#dc2626" } : undefined}
          >
            {isLoading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
