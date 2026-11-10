import React from 'react';
import AppModal from '../../../../../shared/ui/AppModal';
import AppButton from '../../../../../shared/ui/AppButton';
import { useTranslation } from 'react-i18next';

const DeleteConfirmModal = ({ isOpen, onClose, file, onConfirm }) => {
    const { t } = useTranslation('drive');
    if (!isOpen || !file) return null;

    const isFolder = file.type === 'dir' || file.mime_type === 'application/x-directory';

    return (
        <AppModal title={t(file.isBulk ? 'deleteDialog.bulkTitle' : isFolder ? 'deleteDialog.folderTitle' : 'deleteDialog.fileTitle', { count: file.count })} onClose={onClose} maxWidth={480} footer={<>
            <AppButton variant="secondary" onClick={onClose}>{t('deleteDialog.cancel')}</AppButton>
            <AppButton variant="danger" onClick={() => { onConfirm(); onClose(); }}>{t('deleteDialog.confirm')}</AppButton>
        </>}>
            <p className="text-sm leading-6 text-[var(--ts-text-secondary)]">{t(file.isBulk ? 'deleteDialog.bulkMessage' : 'deleteDialog.message', { name: file.name, count: file.count })} {t('deleteDialog.recovery')}</p>
        </AppModal>
    );
};

export default DeleteConfirmModal;
