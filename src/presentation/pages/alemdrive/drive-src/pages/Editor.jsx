import { useTranslation } from 'react-i18next';
import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { getDownloadUrl, getFile } from '../api/files';
import client from '../api/client';
import { Loader2, ArrowLeft } from 'lucide-react';

const officeExtensions = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'csv']);
const textExtensions = new Set(['txt', 'md', 'log', 'json', 'xml', 'yaml', 'yml', 'ini']);

const Editor = () => {
    const { t } = useTranslation('drive');
    const { fileId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const isEmbedded = new URLSearchParams(location.search).get('embedded') === 'true';
    const [file, setFile] = useState(location.state?.file || null);
    const [loading, setLoading] = useState(!location.state?.file);
    const [contentUrl, setContentUrl] = useState(null);
    const [textContent, setTextContent] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (file) return;
        let active = true;
        getFile(fileId)
            .then((value) => { if (active) setFile(value); })
            .catch((reason) => {
                console.error('Failed to load file', reason);
                if (active) setError('editor.loadError');
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [file, fileId]);

    const fileName = file?.name || file?.real_name || '';
    const extension = fileName.split('.').pop()?.toLowerCase();
    const isPdf = extension === 'pdf' || file?.mime_type === 'application/pdf';
    const isImage = /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(fileName) || file?.mime_type?.startsWith('image/');
    const officeMime = /word|spreadsheet|excel|presentation|powerpoint|opendocument|rtf|csv/i.test(file?.mime_type || '');
    const isOffice = officeExtensions.has(extension) || officeMime;
    const isText = textExtensions.has(extension) || (file?.mime_type?.startsWith('text/') && !isOffice);
    const mode = location.state?.mode || (['viewer', 'read'].includes(file?.role || file?.permission) ? 'view' : 'edit');

    useEffect(() => {
        if (!file || isOffice) return;
        if (!isPdf && !isImage && !isText) {
            setLoading(false);
            return;
        }
        let active = true;
        setLoading(true);
        setError('');
        setContentUrl(null);
        setTextContent(null);
        client.get(`/drive/files/${fileId}/download`, { responseType: 'blob' })
            .then((response) => response.data)
            .then(async (blob) => {
                if (!active) return;
                if (isText) {
                    setTextContent(await blob.text());
                    return;
                }
                const type = isPdf ? 'application/pdf' : blob.type;
                setContentUrl(URL.createObjectURL(new Blob([blob], { type })));
            })
            .catch((reason) => {
                console.error('Failed to load content', reason);
                if (active) setError('editor.openError');
            })
            .finally(() => { if (active) setLoading(false); });
        return () => {
            active = false;
        };
    }, [file, fileId, isOffice, isPdf, isImage, isText]);

    useEffect(() => () => {
        if (contentUrl) URL.revokeObjectURL(contentUrl);
    }, [contentUrl]);

    useEffect(() => {
        if (file && isOffice) setLoading(false);
    }, [file, isOffice]);

    const handleBack = () => {
        if (location.state?.fromPublicShare) {
            navigate(location.state?.backTo || '/drive/shared', { replace: true });
            return;
        }
        navigate(-1);
    };

    const apiBase = client.defaults.baseURL || '/api/v1';
    const collaboraUrl = `${apiBase.replace(/\/+$/, '')}/drive/collabora/editor?file_id=${encodeURIComponent(fileId)}&mode=${encodeURIComponent(mode)}`;

    return (
        <div className={`flex min-h-0 min-w-0 w-full flex-col overflow-hidden ${isEmbedded ? 'h-screen bg-white' : 'h-full flex-1 bg-gray-100'}`}>
            {!isEmbedded && (
                <div className="h-12 shrink-0 bg-white border-b flex items-center px-4">
                    <button onClick={handleBack} className="flex shrink-0 items-center text-gray-600 hover:text-gray-900">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        {t('common:actions.back')}
                    </button>
                    <span className="ml-4 min-w-0 truncate font-semibold text-gray-700" title={fileName}>{fileName}</span>
                </div>
            )}

            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                    </div>
                )}
                {error ? (
                    <div className="h-full flex items-center justify-center text-red-600">{t(error)}</div>
                ) : isPdf && contentUrl ? (
                    <iframe src={contentUrl} className="absolute inset-0 block h-full w-full border-none" title={t('editor.pdfTitle')} />
                ) : isImage && contentUrl ? (
                    <div className="flex items-center justify-center h-full bg-gray-900/5 p-4">
                        <img src={contentUrl} alt={fileName} className="max-w-full max-h-full object-contain shadow-lg rounded" />
                    </div>
                ) : isOffice ? (
                    <iframe src={collaboraUrl} className="absolute inset-0 block h-full w-full border-0" title="Collabora Online" allow="clipboard-read; clipboard-write" />
                ) : isText && textContent !== null ? (
                    <pre className="h-full overflow-auto whitespace-pre-wrap break-words bg-white p-6 font-mono text-[13px] leading-6 text-gray-800">{textContent}</pre>
                ) : file ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-gray-600">
                        <p>{t('editor.previewUnavailable')}</p>
                        <a className="text-blue-600 underline" href={getDownloadUrl(fileId)}>{t('editor.downloadFile')}</a>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default Editor;
