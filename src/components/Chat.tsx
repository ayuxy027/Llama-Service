import React, { useState, useRef, useEffect } from 'react';
import {
    ArrowLeft,
    Send,
    FileText,
    Upload,
    X,
    MessageSquare,
    User,
    Brain,
    AlertCircle,
    Paperclip,
    Bug,
    Zap,
    Clock,
    FileCheck
} from 'lucide-react';
import { cn, generateId, formatRelativeTime, parseMarkdown } from '../utils';
import type { Message, Attachment } from '../types';
import { processPDFFile, cleanupPDFResources, getPDFStats, extractKeyInfo } from '../services/pdfService';
import { chatWithContext } from '../services/groqService';

interface ChatProps {
    onBackToLanding: () => void;
}

const Chat: React.FC<ChatProps> = ({ onBackToLanding }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [attachment, setAttachment] = useState<Attachment | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [processingStatus, setProcessingStatus] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [showDebug, setShowDebug] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (attachment) {
                cleanupPDFResources(attachment);
            }
        };
    }, [attachment]);

    const handleFileUpload = async (file: File) => {
        try {
            setIsLoading(true);
            setUploadProgress(0);
            setError(null);
            setProcessingStatus('Validating PDF file...');

            // Simulate upload progress
            const progressInterval = setInterval(() => {
                setUploadProgress(prev => {
                    if (prev < 30) return prev + 5;
                    if (prev < 60) return prev + 3;
                    if (prev < 85) return prev + 2;
                    return prev + 1;
                });
            }, 200);

            setProcessingStatus('Extracting text from PDF...');

            const newAttachment = await processPDFFile(file);

            clearInterval(progressInterval);
            setUploadProgress(100);
            setProcessingStatus('PDF processed successfully!');

            // Clean up previous attachment
            if (attachment) {
                cleanupPDFResources(attachment);
            }

            setAttachment(newAttachment);

            // Get PDF statistics for analysis message
            const stats = getPDFStats(newAttachment);
            const keyInfo = extractKeyInfo(newAttachment.extractedText || '');

            // Auto-analyze the document with extracted content
            const analysisMessage: Message = {
                id: generateId(),
                content: `# PDF Analysis Complete

**Document**: ${newAttachment.name}
**Pages**: ${stats.pages}
**Word Count**: ${stats.wordCount.toLocaleString()}
**Character Count**: ${stats.characterCount.toLocaleString()}
**Estimated Reading Time**: ${stats.readingTime} minutes

${keyInfo.emails.length > 0 ? `**Email Addresses Found**: ${keyInfo.emails.slice(0, 3).join(', ')}${keyInfo.emails.length > 3 ? '...' : ''}\n` : ''}${keyInfo.phones.length > 0 ? `**Phone Numbers Found**: ${keyInfo.phones.slice(0, 3).join(', ')}${keyInfo.phones.length > 3 ? '...' : ''}\n` : ''}${keyInfo.dates.length > 0 ? `**Dates Found**: ${keyInfo.dates.slice(0, 3).join(', ')}${keyInfo.dates.length > 3 ? '...' : ''}\n` : ''}
I have successfully extracted and analyzed the content from your PDF document. The text has been processed and I am now ready to answer questions, provide summaries, or discuss any specific aspects of the document.

## What would you like to know about this document?

Some suggestions:
- "Summarize the main points"
- "What are the key topics covered?"
- "Extract important dates or numbers"
- "What conclusions does the document reach?"`,
                role: 'assistant',
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, analysisMessage]);

            // Add debug message in development
            if (import.meta.env.DEV) {
                console.log('📄 PDF Processing Debug Info:', {
                    fileName: newAttachment.name,
                    fileSize: newAttachment.size,
                    extractedLength: newAttachment.extractedText?.length || 0,
                    pages: stats.pages,
                    wordCount: stats.wordCount,
                    keyInfo,
                    preview: newAttachment.extractedText?.slice(0, 500) + '...'
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to process PDF document';
            setError(errorMessage);
            console.error('PDF upload error:', error);
        } finally {
            setIsLoading(false);
            setUploadProgress(0);
            setProcessingStatus('');
        }
    };

    const handleSendMessage = async () => {
        if ((!input.trim() && !attachment) || isLoading) return;

        const userMessage: Message = {
            id: generateId(),
            content: input.trim(),
            role: 'user',
            timestamp: new Date(),
            attachments: attachment ? [attachment] : undefined,
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        setError(null);

        try {
            const conversationHistory = messages.map(msg => ({
                role: msg.role,
                content: msg.content,
            }));

            let response: string;

            if (attachment && attachment.extractedText) {
                // Chat with document context
                console.log('🤖 Sending message with document context:', {
                    message: input.trim(),
                    documentLength: attachment.extractedText.length,
                    documentName: attachment.name
                });

                response = await chatWithContext(
                    input.trim(),
                    conversationHistory,
                    attachment.extractedText
                );
            } else if (input.trim()) {
                // Regular chat
                response = await chatWithContext(input.trim(), conversationHistory);
            } else {
                response = "I can see you have uploaded a document. Please ask me a question about its content.";
            }

            const aiMessage: Message = {
                id: generateId(),
                content: response,
                role: 'assistant',
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, aiMessage]);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to process your request';
            setError(errorMessage);
            console.error('Chat error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const removeAttachment = () => {
        if (attachment) {
            cleanupPDFResources(attachment);
            setAttachment(null);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <div className="h-screen bg-vintage-white text-vintage-black flex flex-col">
            {/* Header - Clean and Professional */}
            <header className="relative z-10 border-b border-vintage-gray-200 bg-vintage-white/95 backdrop-blur-sm">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <button
                                onClick={onBackToLanding}
                                className="btn-ghost p-2 focus-vintage rounded-lg"
                                title="Back to homepage"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-vintage-black rounded-lg flex items-center justify-center shadow-vintage">
                                    <Brain className="w-6 h-6 text-vintage-white" />
                                </div>
                                <div>
                                    <h1 className="text-xl font-display font-bold tracking-vintage">
                                        DocWise AI
                                    </h1>
                                    <p className="text-xs text-vintage-gray-500">
                                        AI-Powered PDF Analysis
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center space-x-3">
                            {import.meta.env.DEV && (
                                <button
                                    onClick={() => setShowDebug(!showDebug)}
                                    className="btn-ghost p-2 focus-vintage rounded-lg"
                                    title="Toggle debug info"
                                >
                                    <Bug className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Document Status Bar */}
            {attachment && (
                <div className="relative z-10 border-b border-vintage-gray-200 bg-vintage-gray-50">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-vintage-black rounded-lg flex items-center justify-center">
                                    <FileCheck className="w-4 h-4 text-vintage-white" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-vintage-black">
                                        {attachment.name}
                                    </p>
                                    <p className="text-xs text-vintage-gray-500">
                                        {attachment.extractedText?.length.toLocaleString()} characters • Ready for analysis
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={removeAttachment}
                                className="btn-ghost p-2 focus-vintage rounded-lg"
                                title="Remove document"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Debug Panel */}
            {import.meta.env.DEV && showDebug && attachment && (
                <div className="relative z-10 border-b border-vintage-gray-300 bg-vintage-gray-50 px-4 sm:px-6 py-4">
                    <div className="max-w-4xl mx-auto">
                        <h3 className="font-display font-bold mb-3 flex items-center text-sm">
                            <Bug className="w-4 h-4 mr-2" />
                            Debug Information
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                            <div>
                                <span className="text-vintage-gray-500">File Size:</span>
                                <div className="font-medium">{(attachment.size / 1024 / 1024).toFixed(2)} MB</div>
                            </div>
                            <div>
                                <span className="text-vintage-gray-500">Text Length:</span>
                                <div className="font-medium">{attachment.extractedText?.length.toLocaleString()} chars</div>
                            </div>
                            <div>
                                <span className="text-vintage-gray-500">Words:</span>
                                <div className="font-medium">{getPDFStats(attachment).wordCount.toLocaleString()}</div>
                            </div>
                            <div>
                                <span className="text-vintage-gray-500">Pages:</span>
                                <div className="font-medium">{getPDFStats(attachment).pages}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {/* Messages Container */}
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
                        {messages.length === 0 && !attachment && (
                            <div className="h-full flex items-center justify-center">
                                <div className="text-center max-w-lg mx-auto">
                                    <div className="w-20 h-20 bg-vintage-black rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-vintage-lg">
                                        <Brain className="w-10 h-10 text-vintage-white" />
                                    </div>
                                    <h2 className="text-2xl font-display font-bold mb-4 text-vintage-black">
                                        Welcome to DocWise AI
                                    </h2>
                                    <p className="text-vintage-gray-600 mb-8 leading-relaxed">
                                        Upload a PDF document to start analyzing and chatting with your content using advanced AI.
                                    </p>

                                    {/* Upload Area */}
                                    <div className="border-2 border-dashed border-vintage-gray-300 rounded-xl p-8 hover:border-vintage-gray-400 transition-colors">
                                        <div className="text-center">
                                            <Upload className="w-12 h-12 text-vintage-gray-400 mx-auto mb-4" />
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="btn-primary text-base px-6 py-3 mb-3"
                                            >
                                                Choose PDF File
                                            </button>
                                            <p className="text-sm text-vintage-gray-500">
                                                Or drag and drop your PDF here
                                            </p>
                                        </div>
                                    </div>

                                    {/* Quick Actions */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
                                        <div className="card-compact text-center">
                                            <MessageSquare className="w-6 h-6 text-vintage-gray-600 mx-auto mb-2" />
                                            <p className="text-sm font-medium text-vintage-black">Ask Questions</p>
                                            <p className="text-xs text-vintage-gray-500">Natural language queries</p>
                                        </div>
                                        <div className="card-compact text-center">
                                            <Zap className="w-6 h-6 text-vintage-gray-600 mx-auto mb-2" />
                                            <p className="text-sm font-medium text-vintage-black">Get Summaries</p>
                                            <p className="text-xs text-vintage-gray-500">Instant insights</p>
                                        </div>
                                        <div className="card-compact text-center">
                                            <Clock className="w-6 h-6 text-vintage-gray-600 mx-auto mb-2" />
                                            <p className="text-sm font-medium text-vintage-black">Save Time</p>
                                            <p className="text-xs text-vintage-gray-500">Fast analysis</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {(messages.length > 0 || attachment) && (
                            <div className="space-y-6">
                                {messages.map((message, index) => (
                                    <div
                                        key={message.id}
                                        className={cn(
                                            "flex items-start space-x-4 animate-slide-up",
                                            message.role === 'user' ? "justify-end" : "justify-start"
                                        )}
                                        style={{ animationDelay: `${index * 100}ms` }}
                                    >
                                        {message.role === 'assistant' && (
                                            <div className="w-10 h-10 bg-vintage-black rounded-xl flex items-center justify-center flex-shrink-0 shadow-vintage">
                                                <Brain className="w-5 h-5 text-vintage-white" />
                                            </div>
                                        )}

                                        <div
                                            className={cn(
                                                "max-w-2xl p-5 shadow-vintage-lg transition-all duration-300 hover:shadow-vintage-xl rounded-2xl",
                                                message.role === 'user'
                                                    ? "bg-vintage-black text-vintage-white ml-auto rounded-br-lg"
                                                    : "bg-vintage-white border border-vintage-gray-200 rounded-bl-lg"
                                            )}
                                        >
                                            <div className={cn(
                                                "font-sans leading-relaxed prose prose-vintage max-w-none text-sm",
                                                message.role === 'user'
                                                    ? "text-vintage-white"
                                                    : "text-vintage-black"
                                            )}>
                                                {message.role === 'assistant' ? (
                                                    <div dangerouslySetInnerHTML={{ __html: parseMarkdown(message.content) }} />
                                                ) : (
                                                    message.content.split('\n').map((line, i) => (
                                                        <p key={i} className={i > 0 ? "mt-3" : ""}>
                                                            {line}
                                                        </p>
                                                    ))
                                                )}
                                            </div>

                                            {message.attachments && message.attachments.length > 0 && (
                                                <div className={cn(
                                                    "mt-4 pt-4 border-t",
                                                    message.role === 'user'
                                                        ? "border-vintage-white/20"
                                                        : "border-vintage-gray-200"
                                                )}>
                                                    {message.attachments.map((att) => (
                                                        <div key={att.id} className="flex items-center space-x-2 text-xs font-mono">
                                                            <FileText className="w-4 h-4" />
                                                            <span>{att.name}</span>
                                                            <span className="text-vintage-gray-500">
                                                                ({att.extractedText?.length.toLocaleString()} chars)
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <div className={cn(
                                                "text-xs mt-4 font-mono uppercase tracking-wide",
                                                message.role === 'user'
                                                    ? "text-vintage-white/60"
                                                    : "text-vintage-gray-400"
                                            )}>
                                                {formatRelativeTime(message.timestamp)}
                                            </div>
                                        </div>

                                        {message.role === 'user' && (
                                            <div className="w-10 h-10 border border-vintage-gray-300 rounded-xl flex items-center justify-center flex-shrink-0 bg-vintage-white shadow-vintage">
                                                <User className="w-5 h-5 text-vintage-black" />
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {isLoading && (
                                    <div className="flex items-start space-x-4 animate-slide-up">
                                        <div className="w-10 h-10 bg-vintage-black rounded-xl flex items-center justify-center shadow-vintage">
                                            <Brain className="w-5 h-5 text-vintage-white" />
                                        </div>
                                        <div className="bg-vintage-white border border-vintage-gray-200 rounded-2xl rounded-bl-lg p-5 shadow-vintage-lg">
                                            <div className="flex items-center space-x-3">
                                                <div className="spinner-vintage" />
                                                <span className="font-mono text-vintage-gray-600 text-sm">
                                                    {processingStatus || 'Thinking...'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="border-t border-vintage-gray-200 bg-vintage-gray-50 px-4 sm:px-6 py-4">
                        <div className="max-w-4xl mx-auto">
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
                                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                                <span className="text-red-800 flex-1 text-sm">{error}</span>
                                <button
                                    onClick={() => setError(null)}
                                    className="text-red-600 hover:text-red-800 p-1"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Upload Progress */}
                {uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="border-t border-vintage-gray-200 bg-vintage-gray-50 px-4 sm:px-6 py-4">
                        <div className="max-w-4xl mx-auto">
                            <div className="bg-vintage-white border border-vintage-gray-200 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-sm font-medium text-vintage-black">
                                        {processingStatus || 'Processing...'}
                                    </span>
                                    <span className="text-sm text-vintage-gray-500 font-mono">
                                        {uploadProgress}%
                                    </span>
                                </div>
                                <div className="bg-vintage-gray-200 h-2 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-vintage-black transition-all duration-300 rounded-full"
                                        style={{ width: `${uploadProgress}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Input Area */}
                <div className="border-t border-vintage-gray-200 bg-vintage-white">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
                        <div className="flex items-end space-x-3">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(file);
                                }}
                                className="hidden"
                            />

                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="btn-ghost p-3 focus-vintage rounded-lg flex-shrink-0"
                                title="Upload PDF"
                                disabled={isLoading}
                            >
                                <Paperclip className="w-5 h-5" />
                            </button>

                            <div className="flex-1 relative">
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    placeholder={attachment ? "Ask about your document..." : "Upload a PDF or ask anything..."}
                                    className="w-full px-4 py-3 text-sm border border-vintage-gray-300 rounded-xl bg-vintage-white text-vintage-black placeholder-vintage-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-vintage-gray-400 focus:border-vintage-gray-400 transition-all duration-200"
                                    disabled={isLoading}
                                    rows={1}
                                    style={{ minHeight: '48px', maxHeight: '120px' }}
                                />
                            </div>

                            <button
                                onClick={handleSendMessage}
                                disabled={(!input.trim() && !attachment) || isLoading}
                                className="btn-primary p-3 disabled:opacity-50 disabled:cursor-not-allowed focus-vintage rounded-lg flex-shrink-0"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Chat; 