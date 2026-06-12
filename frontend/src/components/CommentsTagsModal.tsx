import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { MessageSquare, Tag, X, Plus, Trash2, Send } from 'lucide-react'
import {
  type CommentOut,
  type EntityType,
  type RecordDataOut,
  addComment,
  addTag,
  deleteComment,
  fetchRecordData,
  removeTag,
} from '../lib/api'

interface Props {
  entityType: EntityType
  entityId: number
  entityName: string
  currentUserId: number
  isManager: boolean
  onClose: () => void
}

const TAG_COLORS: Record<string, string> = {
  'VIP': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'Late Payer': 'bg-red-100 text-red-800 border-red-300',
  'Express Shipping': 'bg-blue-100 text-blue-800 border-blue-300',
  'Loyal Customer': 'bg-green-100 text-green-800 border-green-300',
  'Special Price': 'bg-purple-100 text-purple-800 border-purple-300',
}

function tagColor(tag: string): string {
  return TAG_COLORS[tag] ?? 'bg-gray-100 text-gray-700 border-gray-300'
}

function relativeTime(t: TFunction, iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return t('comments.justNow')
  if (diff < 3600) return t('comments.minAgo', { n: Math.floor(diff / 60) })
  if (diff < 86400) return t('comments.hourAgo', { n: Math.floor(diff / 3600) })
  return t('comments.dayAgo', { n: Math.floor(diff / 86400) })
}

export default function CommentsTagsModal({
  entityType,
  entityId,
  entityName,
  currentUserId,
  isManager,
  onClose,
}: Props) {
  const { t } = useTranslation()
  const [data, setData] = useState<RecordDataOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [customTag, setCustomTag] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setLoading(true)
    fetchRecordData(entityType, entityId)
      .then(setData)
      .finally(() => setLoading(false))
  }, [entityType, entityId])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [loading])

  async function handleAddComment() {
    if (!commentText.trim() || submitting) return
    setSubmitting(true)
    try {
      const c = await addComment(entityType, entityId, commentText.trim())
      setData(prev => prev ? { ...prev, comments: [c, ...prev.comments] } : prev)
      setCommentText('')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteComment(id: number) {
    await deleteComment(id)
    setData(prev => prev ? { ...prev, comments: prev.comments.filter(c => c.id !== id) } : prev)
  }

  async function handleAddTag(tag: string) {
    if (!tag.trim()) return
    const t = tag.trim()
    if (data?.tags.includes(t)) return
    await addTag(entityType, entityId, t)
    setData(prev => prev ? { ...prev, tags: [...prev.tags, t].sort() } : prev)
    setCustomTag('')
  }

  async function handleRemoveTag(tag: string) {
    await removeTag(entityType, entityId, tag)
    setData(prev => prev ? { ...prev, tags: prev.tags.filter(t => t !== tag) } : prev)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-500" />
            <span className="font-semibold text-gray-800 truncate max-w-xs">{entityName}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">{t('common.loading')}</div>
          ) : (
            <>
              {/* Tags Section */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Tag className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">{t('comments.tags')}</span>
                </div>

                {/* Active tags */}
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                  {data?.tags.length === 0 && (
                    <span className="text-xs text-gray-400 italic">{t('comments.noTags')}</span>
                  )}
                  {data?.tags.map(tag => (
                    <span
                      key={tag}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${tagColor(tag)}`}
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:opacity-60 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                {/* Preset tags */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {data?.preset_tags
                    .filter(t => !data.tags.includes(t))
                    .map(tag => (
                      <button
                        key={tag}
                        onClick={() => handleAddTag(tag)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-dashed ${tagColor(tag)} opacity-60 hover:opacity-100 transition-opacity`}
                      >
                        <Plus className="w-3 h-3" />
                        {tag}
                      </button>
                    ))}
                </div>

                {/* Custom tag input */}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customTag}
                    onChange={e => setCustomTag(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddTag(customTag)}
                    placeholder={t('comments.customTagPlaceholder')}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <button
                    onClick={() => handleAddTag(customTag)}
                    disabled={!customTag.trim()}
                    className="px-3 py-1.5 bg-indigo-500 text-white text-xs rounded-lg hover:bg-indigo-600 disabled:opacity-40 transition-colors"
                  >
                    {t('common.add')}
                  </button>
                </div>
              </div>

              {/* Comments Section */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <MessageSquare className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">
                    {t('comments.title')}
                    {data && data.comments.length > 0 && (
                      <span className="ml-1.5 text-xs text-gray-400">({data.comments.length})</span>
                    )}
                  </span>
                </div>

                {/* Comment list */}
                <div className="space-y-2.5 max-h-52 overflow-y-auto mb-3">
                  {data?.comments.length === 0 && (
                    <p className="text-xs text-gray-400 italic">{t('comments.noComments')}</p>
                  )}
                  {data?.comments.map((c: CommentOut) => (
                    <div key={c.id} className="bg-gray-50 rounded-xl p-3 group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-semibold text-gray-700">{c.author_name}</span>
                            <span className="text-xs text-gray-400">{relativeTime(t, c.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{c.body}</p>
                        </div>
                        {(c.user_id === currentUserId || isManager) && (
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 transition-all text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add comment */}
                <div className="flex gap-2">
                  <textarea
                    ref={textareaRef}
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddComment()
                    }}
                    placeholder={t('comments.commentPlaceholder')}
                    rows={2}
                    className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!commentText.trim() || submitting}
                    className="px-3 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-40 transition-colors self-end pb-2 pt-2"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
