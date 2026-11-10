import { useTranslation } from 'react-i18next';
import { i18n } from '../../../../../shared/i18n';
import React, { useState, useEffect, useRef, useId } from 'react';
import AppModal from '../../../../../shared/ui/AppModal';
import AppButton from '../../../../../shared/ui/AppButton';

const CreateFileModal = ({ isOpen, onClose, type, onCreate }) => {
    const { t } = useTranslation('drive');
    const formId = useId();
    const [fileName, setFileName] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            // Use the current language on open without resetting edits on language changes.
            setFileName(i18n.t('drive:createFile.defaultName'));
            setTimeout(() => {
                inputRef.current?.select();
            }, 100);
        }
    }, [isOpen, type]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!fileName.trim()) return;
        onCreate(fileName);
        onClose();
    };

    if (!isOpen) return null;

    const getTitle = () => {
        switch (type) {
            case 'docx': return t('createFile.titleDocx');
            case 'xlsx': return t('createFile.titleXlsx');
            case 'pptx': return t('createFile.titlePptx');
            default: return t('createFile.titleTxt');
        }
    };

    return (
        <AppModal title={getTitle()} onClose={onClose} maxWidth={480} footer={<>
            <AppButton variant="secondary" onClick={onClose}>{t('common:actions.cancel')}</AppButton>
            <AppButton type="submit" form={formId} disabled={!fileName.trim()}>{t('common:actions.create')}</AppButton>
        </>}>
            <form id={formId} onSubmit={handleSubmit}>
                <label className="ts-field"><span>{t('createFile.name')}</span><input ref={inputRef} value={fileName} onChange={(e) => setFileName(e.target.value)} className="ts-input" placeholder={t('createFile.placeholder')} autoFocus /></label>
            </form>
        </AppModal>
    );
};

export default CreateFileModal;
