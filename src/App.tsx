/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo } from "react";
import { 
  Upload, 
  FileText, 
  ChevronUp, 
  ChevronDown, 
  Download, 
  Trash2, 
  Table as TableIcon,
  Search,
  AlertCircle,
  CheckCircle2,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import * as XLSX from "xlsx";
import { cn } from "./lib/utils";

export interface LabelField {
  id: string;
  name: string;
  value: string;
  type?: string;
}

export interface LabelData {
  fileName: string;
  category?: string;
  fields: LabelField[];
}

export default function App() {
  const [filesData, setFilesData] = useState<LabelData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showAllTable, setShowAllTable] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [isExporting, setIsExporting] = useState(false);

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const newFilesData: LabelData[] = [];
    for (const file of Array.from(files)) {
      try {
        // We use the Python-powered API for parsing
        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        
        // Convert to hex string for transmission
        let hex = "";
        for (let i = 0; i < uint8.length; i++) {
          hex += uint8[i].toString(16).padStart(2, '0');
        }

        const response = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            content_hex: hex
          })
        });

        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        newFilesData.push(data);
      } catch (err) {
        console.error("Error parsing file:", file.name, err);
        // Fallback for .nlbl which might need JS logic or updated Python logic
        // For now, let's assume the Python parser handles it or we show error
        alert(`Error parsing ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    if (newFilesData.length > 0) {
      setFilesData(prev => [...prev, ...newFilesData]);
      if (filesData.length === 0) setCurrentIndex(0);
    }
  }, [filesData.length]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handlePrev = () => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : prev));
  };

  const handleNext = () => {
    setCurrentIndex(prev => (prev < filesData.length - 1 ? prev + 1 : prev));
  };

  const removeFile = (index: number) => {
    setFilesData(prev => {
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });
    if (currentIndex >= filesData.length - 1 && currentIndex > 0) {
      setCurrentIndex(filesData.length - 2);
    }
  };

  const getCategory = (fileName: string) => {
    if (fileName.startsWith("CC80")) return "銘版";
    if (fileName.startsWith("CC81")) return "貼紙";
    return "";
  };

  const exportToExcel = () => {
    if (filesData.length === 0) return;
    setIsExporting(true);

    try {
      // Get all unique IDs across all files to create columns
      const allIds = Array.from(new Set(filesData.flatMap(f => f.fields.map(field => field.id)))).sort() as string[];

      // Create rows: one row per file
      const exportData = filesData.map(file => {
        const row: Record<string, string> = { 
          "FileName": file.fileName,
          "種類": getCategory(file.fileName)
        };
        allIds.forEach(id => {
          const field = file.fields.find(f => f.id === id);
          row[id] = field ? field.value : "(空)";
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Bar-One Label Data");
      
      // Use a more robust manual download method
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' 
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Bar-One_Label_Data_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setIsExporting(false);
      }, 100);
    } catch (error) {
      console.error("Export failed:", error);
      setIsExporting(false);
      // Fallback to simple writeFile if manual fails
      try {
        const ws = XLSX.utils.json_to_sheet([]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Error");
        XLSX.writeFile(wb, "export_error.xlsx");
      } catch (e) {}
    }
  };

  const allUniqueIds = useMemo<string[]>(() => {
    return Array.from(new Set(filesData.flatMap(f => f.fields.map(field => field.id)))).sort() as string[];
  }, [filesData]);

  const currentFile = filesData[currentIndex];

  const filteredFields = useMemo(() => {
    if (!currentFile) return [];
    return currentFile.fields.filter(f => 
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.value.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [currentFile, searchTerm]);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <FileText size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">Bar-One Parser</h1>
            <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Legacy Label Data Extractor</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {filesData.length > 0 && (
            <>
              <button
                onClick={() => setShowAllTable(true)}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg transition-all font-medium text-sm"
              >
                <TableIcon size={18} />
                <span>View All</span>
              </button>
              <button
                onClick={exportToExcel}
                disabled={isExporting}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg transition-all shadow-md font-medium text-sm",
                  isExporting 
                    ? "bg-neutral-200 text-neutral-400 cursor-not-allowed" 
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100"
                )}
              >
                <Download size={18} className={isExporting ? "animate-bounce" : ""} />
                <span>{isExporting ? "Exporting..." : "Export Excel"}</span>
              </button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Sidebar: File List */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Upload Zone */}
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={cn(
              "relative group cursor-pointer border-2 border-dashed rounded-2xl p-8 transition-all duration-300 flex flex-col items-center justify-center gap-4 text-center",
              isDragging 
                ? "border-blue-500 bg-blue-50/50 scale-[1.02]" 
                : "border-neutral-200 bg-white hover:border-blue-400 hover:bg-neutral-50/50"
            )}
          >
            <input
              type="file"
              multiple
              accept=".lbl,.nlbl"
              onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300",
              isDragging ? "bg-blue-100 text-blue-600" : "bg-neutral-100 text-neutral-400 group-hover:bg-blue-50 group-hover:text-blue-500"
            )}>
              <Upload size={32} />
            </div>
            <div>
              <p className="font-semibold text-neutral-800">Upload Bar-One Files</p>
              <p className="text-sm text-neutral-500 mt-1">Drag & drop .lbl or .nlbl files here</p>
            </div>
          </div>

          {/* File List */}
          <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden flex flex-col shadow-sm">
            <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/50 flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Files ({filesData.length})</span>
              {filesData.length > 0 && (
                <button 
                  onClick={() => { setFilesData([]); setCurrentIndex(0); }}
                  className="text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>
            <div className="max-h-[400px] overflow-y-auto divide-y divide-neutral-100">
              {filesData.length === 0 ? (
                <div className="p-8 text-center">
                  <AlertCircle className="mx-auto text-neutral-300 mb-2" size={24} />
                  <p className="text-sm text-neutral-400">No files uploaded yet</p>
                </div>
              ) : (
                filesData.map((file, idx) => (
                  <div
                    key={`${file.fileName}-${idx}`}
                    onClick={() => setCurrentIndex(idx)}
                    className={cn(
                      "group px-4 py-3 flex items-center justify-between cursor-pointer transition-all",
                      currentIndex === idx ? "bg-blue-50/50 border-l-4 border-blue-500" : "hover:bg-neutral-50 border-l-4 border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        currentIndex === idx ? "bg-blue-100 text-blue-600" : "bg-neutral-100 text-neutral-400"
                      )}>
                        <FileText size={16} />
                      </div>
                      <span className={cn(
                        "text-sm font-medium truncate",
                        currentIndex === idx ? "text-blue-700" : "text-neutral-700"
                      )}>
                        {file.fileName}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Content: Current File Viewer */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {currentFile ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden flex flex-col min-h-[600px]"
            >
              {/* Viewer Header */}
              <div className="px-6 py-4 border-b border-neutral-100 bg-white flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <h2 className="text-lg font-bold text-neutral-900 truncate max-w-[300px]">{currentFile.fileName}</h2>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-600 text-[10px] font-bold uppercase tracking-wider">
                        <CheckCircle2 size={10} />
                        Parsed Successfully
                      </span>
                      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                        {currentFile.fields.length} Fields Found
                      </span>
                      {getCategory(currentFile.fileName) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider">
                          種類: {getCategory(currentFile.fileName)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrev}
                    disabled={currentIndex === 0}
                    className="p-2 rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Previous File"
                  >
                    <ChevronUp size={20} />
                  </button>
                  <div className="px-3 py-1 bg-neutral-100 rounded-lg text-xs font-bold text-neutral-600">
                    {currentIndex + 1} / {filesData.length}
                  </div>
                  <button
                    onClick={handleNext}
                    disabled={currentIndex === filesData.length - 1}
                    className="p-2 rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Next File"
                  >
                    <ChevronDown size={20} />
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="px-6 py-3 border-b border-neutral-100 bg-neutral-50/30">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search fields or values..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              {/* Fields Grid */}
              <div className="flex-1 overflow-y-auto p-6">
                {filteredFields.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-neutral-400 gap-3 py-20">
                    <Search size={48} className="opacity-20" />
                    <p className="font-medium">No matching fields found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <AnimatePresence mode="popLayout">
                      {filteredFields.map((field, idx) => (
                        <motion.div
                          key={`${field.id}-${idx}`}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="group bg-neutral-50 hover:bg-white border border-neutral-100 hover:border-blue-200 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-blue-500/5"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{field.id}</span>
                            {field.type && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600">
                                {field.type}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-neutral-800 mb-1 group-hover:text-blue-600 transition-colors">
                            {field.name || "Unnamed Field"}
                          </h3>
                          <div className="bg-white border border-neutral-100 rounded-lg p-3 mt-2 break-all">
                            <p className="text-sm font-mono text-neutral-600 leading-relaxed">
                              {field.value || <span className="italic text-neutral-300">Empty</span>}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="h-full min-h-[600px] flex flex-col items-center justify-center bg-white rounded-2xl border border-neutral-200 border-dashed text-neutral-400 gap-4">
              <div className="w-20 h-20 rounded-full bg-neutral-50 flex items-center justify-center">
                <Upload size={40} className="opacity-20" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-neutral-500">No File Selected</p>
                <p className="text-sm">Upload or select a file to view its extracted data</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Full Table Modal */}
      <AnimatePresence>
        {showAllTable && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-neutral-900/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-6xl h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="px-8 py-6 border-b border-neutral-100 flex items-center justify-between bg-white">
                <div>
                  <h2 className="text-2xl font-bold text-neutral-900">All Extracted Data</h2>
                  <p className="text-sm text-neutral-500">Consolidated view of all fields across {filesData.length} files</p>
                </div>
                <button
                  onClick={() => setShowAllTable(false)}
                  className="p-2 hover:bg-neutral-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-8">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="text-left border-b-2 border-neutral-100">
                        <th className="pb-4 font-bold text-xs uppercase tracking-widest text-neutral-400 px-4 sticky left-0 bg-white z-10">FileName</th>
                        <th className="pb-4 font-bold text-xs uppercase tracking-widest text-neutral-400 px-4 min-w-[100px]">種類</th>
                        {allUniqueIds.map(id => (
                          <th key={id} className="pb-4 font-bold text-xs uppercase tracking-widest text-neutral-400 px-4 min-w-[150px] max-w-[300px]">{id}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-50">
                      {filesData.map((file, idx) => (
                        <tr key={`${file.fileName}-${idx}`} className="hover:bg-neutral-50 transition-colors">
                          <td className="py-4 px-4 text-sm font-bold text-neutral-800 sticky left-0 bg-white z-10 border-r border-neutral-100 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                            {file.fileName}
                          </td>
                          <td className="py-4 px-4 text-sm font-medium text-neutral-600">
                            {getCategory(file.fileName) || <span className="text-neutral-200">-</span>}
                          </td>
                          {allUniqueIds.map(id => {
                            const field = file.fields.find(f => f.id === id);
                            return (
                              <td key={id} className="py-4 px-4 text-sm font-mono text-neutral-600 break-all min-w-[150px] max-w-[300px]">
                                {field ? field.value : <span className="text-neutral-300 italic">(空)</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="px-8 py-6 border-t border-neutral-100 bg-neutral-50 flex justify-end gap-4">
                <button
                  onClick={() => setShowAllTable(false)}
                  className="px-6 py-2 font-bold text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={exportToExcel}
                  disabled={isExporting}
                  className={cn(
                    "flex items-center gap-2 px-6 py-2 rounded-xl transition-all shadow-lg font-bold",
                    isExporting
                      ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100"
                  )}
                >
                  <Download size={18} className={isExporting ? "animate-bounce" : ""} />
                  <span>{isExporting ? "Processing..." : "Download Spreadsheet"}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
