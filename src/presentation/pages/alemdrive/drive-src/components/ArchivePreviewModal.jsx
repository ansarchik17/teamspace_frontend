import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Folder, File, Download, Loader2, Archive, AlertCircle, FileArchive } from 'lucide-react';
import JSZip from 'jszip';
import client from '../api/client';
import { getDownloadUrl } from '../api/files';

const ArchivePreviewModal = ({ isOpen, onClose, file }) => {
    const [fileList, setFileList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [archiveType, setArchiveType] = useState('zip');

    useEffect(() => {
        if (!isOpen || !file) {
            setFileList([]);
            setError(null);
            return;
        }

        const fileName = file.name || file.real_name || '';
        const isRar = /\.rar$/i.test(fileName);
        
        if (isRar) {
            setArchiveType('rar');
            return;
        }

        setArchiveType('zip');
        const loadArchive = async () => {
            setLoading(true);
            setError(null);
            try {
                // Fetch file as blob
                const response = await client.get(`/drive/files/${file.id}/download`, {
                    responseType: 'blob'
                });
                
                const blob = response.data;
                const zip = new JSZip();
                const contents = await zip.loadAsync(blob);
                
                const entries = [];
                contents.forEach((relativePath, zipEntry) => {
                    entries.push({
                        name: relativePath,
                        dir: zipEntry.dir,
                        size: zipEntry._data?.uncompressedSize || 0,
                        zipEntry: zipEntry
                    });
                });

                // Sort directories first, then files
                entries.sort((a, b) => {
                    if (a.dir && !b.dir) return -1;
                    if (!a.dir && b.dir) return 1;
                    return a.name.localeCompare(b.name);
                });

                setFileList(entries);
            } catch (err) {
                console.error("Failed to parse zip archive", err);
                setError("Не удалось открыть архив. Возможно, файл поврежден или зашифрован.");
            } finally {
                setLoading(false);
            }
        };

        loadArchive();

    }, [isOpen, file]);

    if (!isOpen || !file) return null;

    const handleDownloadIndividualFile = async (entry) => {
        try {
            const blob = await entry.zipEntry.async('blob');
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const fileNameOnly = entry.name.split('/').filter(Boolean).pop() || 'file';
            link.setAttribute('download', fileNameOnly);
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Failed to extract file", err);
        }
    };

    const handleDownloadFullArchive = () => {
        const url = getDownloadUrl(file.id);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', file.name || file.real_name || 'archive');
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <AnimatePresence>
            <div className="ts-legacy-backdrop fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-[#E2E8F0] flex flex-col max-h-[85vh]"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-[#E2E8F0] flex justify-between items-center bg-slate-50/50">
                        <div className="flex items-center space-x-3.5 min-w-0">
                            <div className="p-2.5 bg-[#EEF2FF] rounded-2xl border border-[#BBDEFB] text-[#2458D3] shrink-0">
                                <Archive className="h-6 w-6" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-base font-bold text-gray-900 truncate leading-snug">{file.name || file.real_name}</h3>
                                <p className="text-[10px] text-[#94A3B8] font-bold uppercase tracking-wider mt-0.5">Содержимое архива</p>
                            </div>
                        </div>
                        <button 
                            onClick={onClose} 
                            className="text-gray-400 hover:text-gray-600 p-2 bg-white rounded-full border border-[#E2E8F0] shadow-sm transition-colors hover:bg-slate-50 shrink-0"
                        >
                            <X className="h-4.5 w-4.5 stroke-[2.5]" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 min-h-[250px] flex flex-col">
                        {archiveType === 'rar' ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
                                <div className="bg-[#FFF8E1] border border-[#FFE082] rounded-full h-16 w-16 flex items-center justify-center text-[#FFB300]">
                                    <AlertCircle className="h-8 w-8" />
                                </div>
                                <div className="max-w-md">
                                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-tight">Просмотр RAR временно недоступен</h4>
                                    <p className="mt-2 text-xs text-[#64748B] leading-relaxed">
                                        Просмотр содержимого RAR-архивов онлайн временно не поддерживается из-за ограничений формата. Вы можете скачать архив целиком для просмотра на своем устройстве.
                                    </p>
                                </div>
                                <button
                                    onClick={handleDownloadFullArchive}
                                    className="ts-button ts-button--primary flex items-center gap-2 px-5 py-3 text-xs font-bold text-white bg-[#2458D3] hover:bg-[#1565C0] rounded-2xl shadow-lg shadow-blue-100 transition-all active:scale-95 cursor-pointer"
                                >
                                    <Download className="h-4.5 w-4.5 stroke-[2.5]" />
                                    Скачать полный архив
                                </button>
                            </div>
                        ) : loading ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-[#2458D3]">
                                <Loader2 className="h-10 w-10 animate-spin mb-3" />
                                <p className="text-xs font-bold text-slate-500">Чтение архива...</p>
                            </div>
                        ) : error ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
                                <div className="bg-red-50 border border-red-100 rounded-full h-16 w-16 flex items-center justify-center text-red-500">
                                    <AlertCircle className="h-8 w-8" />
                                </div>
                                <div className="max-w-md">
                                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-tight">Ошибка чтения архива</h4>
                                    <p className="mt-2 text-xs text-red-500 leading-relaxed">{error}</p>
                                </div>
                                <button
                                    onClick={handleDownloadFullArchive}
                                    className="flex items-center gap-2 px-5 py-3 text-xs font-bold text-gray-700 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all active:scale-95 cursor-pointer"
                                >
                                    <Download className="h-4.5 w-4.5 stroke-[2.5]" />
                                    Скачать файл напрямую
                                </button>
                            </div>
                        ) : fileList.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                                <FileArchive className="h-12 w-12 text-slate-300 mb-2" />
                                <p className="text-xs font-bold text-gray-500">Архив пуст</p>
                            </div>
                        ) : (
                            <div className="border border-[#E2E8F0] rounded-2xl overflow-hidden divide-y divide-[#E2E8F0]">
                                {fileList.map((entry, idx) => (
                                    <div 
                                        key={idx}
                                        className="flex items-center justify-between p-3.5 hover:bg-slate-50/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0 pr-4">
                                            {entry.dir ? (
                                                <Folder className="h-4.5 w-4.5 text-[#2458D3] shrink-0 fill-[#EEF2FF]" />
                                            ) : (
                                                <File className="h-4.5 w-4.5 text-[#64748B] shrink-0" />
                                            )}
                                            <span className="text-xs font-semibold text-slate-700 truncate leading-tight">
                                                {entry.name}
                                            </span>
                                        </div>
                                        {!entry.dir && (
                                            <div className="flex items-center gap-3 shrink-0">
                                                <span className="text-[10px] font-bold text-[#94A3B8]">
                                                    {formatBytes(entry.size)}
                                                </span>
                                                <button
                                                    onClick={() => handleDownloadIndividualFile(entry)}
                                                    className="p-1.5 text-[#64748B] hover:text-[#2458D3] hover:bg-[#EEF2FF] rounded-lg transition-colors cursor-pointer"
                                                    title="Извлечь и скачать"
                                                >
                                                    <Download className="h-4 w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-[#E2E8F0] bg-slate-50/50 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 text-xs font-bold text-gray-700 bg-white hover:bg-slate-50 border border-[#E2E8F0] rounded-xl transition-all cursor-pointer"
                        >
                            Закрыть
                        </button>
                        <button
                            onClick={handleDownloadFullArchive}
                            className="ts-button ts-button--primary flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-[#2458D3] hover:bg-[#1565C0] rounded-xl shadow-md shadow-blue-50 transition-all cursor-pointer"
                        >
                            <Download className="h-4 w-4 stroke-[2.5]" />
                            Скачать весь архив
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default ArchivePreviewModal;
