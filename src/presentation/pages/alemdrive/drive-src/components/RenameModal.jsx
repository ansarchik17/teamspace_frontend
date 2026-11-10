import React, { useState, useEffect, useId } from 'react';
import AppModal from '../../../../../shared/ui/AppModal';
import AppButton from '../../../../../shared/ui/AppButton';

const RenameModal = ({ isOpen, onClose, file, onConfirm }) => {
    const formId = useId();
    const [baseName, setBaseName] = useState('');
    const [extension, setExtension] = useState('');
    const [validationError, setValidationError] = useState('');

    useEffect(() => {
        if (isOpen && file) {
            const fullName = file.name || '';
            const isFolder = file.type === 'dir' || file.mime_type === 'application/x-directory';
            const dotIndex = fullName.lastIndexOf('.');
            setValidationError('');
            if (!isFolder && dotIndex > 0) {
                setBaseName(fullName.slice(0, dotIndex));
                setExtension(fullName.slice(dotIndex)); // includes the dot, e.g. ".docx"
            } else {
                setBaseName(fullName);
                setExtension('');
            }
        }
    }, [isOpen, file]);

    if (!isOpen || !file) return null;

    const isFolder = file.type === 'dir' || file.mime_type === 'application/x-directory';

    const handleSubmit = (e) => {
        e.preventDefault();
        const trimmed = baseName.trim();
        if (!trimmed) return;
        if (/[\\/\u0000-\u001F]/.test(trimmed)) {
            setValidationError('Название не должно содержать слеши или управляющие символы.');
            return;
        }
        const fullName = extension ? trimmed + extension : trimmed;
        onConfirm(fullName);
        onClose();
    };

    return (
        <AppModal title={`Переименовать ${isFolder ? 'папку' : 'файл'}`} onClose={onClose} maxWidth={480} footer={<>
            <AppButton variant="secondary" onClick={onClose}>Отмена</AppButton>
            <AppButton type="submit" form={formId} disabled={!baseName.trim()}>Сохранить</AppButton>
        </>}>
            <form id={formId} onSubmit={handleSubmit}>
                <label className="ts-field"><span>{isFolder ? 'Название папки' : 'Название файла'}</span><div className="flex items-center gap-2"><input className="ts-input" value={baseName} onChange={(e) => { setBaseName(e.target.value); setValidationError(''); }} placeholder={isFolder ? 'Название папки' : 'Название файла'} autoFocus />{!isFolder && extension && <span className="text-sm text-[var(--ts-text-secondary)]">{extension}</span>}</div></label>
                {validationError && <p role="alert" className="mt-3 text-sm text-[var(--ts-danger)]">{validationError}</p>}
            </form>
        </AppModal>
    );
};

export default RenameModal;
