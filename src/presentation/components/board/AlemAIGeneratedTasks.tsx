import React, { useState } from 'react';
import AppSelect from '../../../shared/ui/AppSelect';
import MaterialSymbol from '../../../shared/ui/MaterialSymbol';
import type { TzAiTaskItem, TzAiPriority } from '../../pages/alemai/tzai/types';
import { bt } from './boardText'

interface AlemAIGeneratedTasksProps {
  tasks: TzAiTaskItem[];
  kanbanContext: Record<string, { 
    board: { id: string; name: string }; 
    columns: { column: { id: string; name: string } }[]; 
    sprints: { id: string; name: string }[]; 
    members: { user_id: number; name: string }[]; 
  }>;
  onClose: () => void;
  onConfirm: (tasks: TzAiTaskItem[]) => void;
}

export const AlemAIGeneratedTasks: React.FC<AlemAIGeneratedTasksProps> = ({
  tasks: initialTasks,
  kanbanContext,
  onClose,
  onConfirm,
}) => {
  const [editedTasks, setEditedTasks] = useState<TzAiTaskItem[]>(initialTasks);

  const boards = Object.values(kanbanContext).map((ctx) => ctx.board);
  
  const handleTaskChange = (index: number, updates: Partial<TzAiTaskItem>) => {
    const newTasks = [...editedTasks];
    newTasks[index] = { ...newTasks[index], ...updates };
    setEditedTasks(newTasks);
  };

  const removeTask = (index: number) => {
    setEditedTasks(editedTasks.filter((_, i) => i !== index));
  };

  const getBoardOptions = (boardId: string | null) => {
    const ctx = kanbanContext[boardId || ''];
    if (!ctx) return { columns: [], sprints: [], members: [] };
    return {
      columns: ctx.columns || [],
      sprints: ctx.sprints || [],
      members: ctx.members || [],
    };
  };

  return (
    <div className="fixed inset-0 z-[700] flex flex-col bg-[#FDF5F0]">
      {/* Header */}
      <div className="flex h-14 items-center border-b border-[#DDE3EE] bg-white px-4 shadow-sm">
        <button
          onClick={onClose}
          className="mr-4 flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100"
        >
          <MaterialSymbol name="arrow_back" size={20} color="#374C6B" />
        </button>
        <h2 className="text-base font-bold text-[#0A1628]">{bt('generated.title')}</h2>
        <div className="ml-auto">
           <button
            onClick={() => onConfirm(editedTasks)}
            disabled={editedTasks.length === 0}
            className="flex h-9 items-center justify-center rounded-lg bg-[#1E72E7] px-4 text-xs font-bold text-white shadow-md hover:bg-[#1861CA] disabled:opacity-50"
          >
            {bt('generated.createMany', { count: editedTasks.length })}
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {editedTasks.map((task, index) => {
            const { columns, sprints, members } = getBoardOptions(task.board_id);

            return (
              <div key={index} className="overflow-hidden rounded-xl bg-white shadow-card border border-[#DDE3EE]">
                {/* Task Header */}
                <div className="flex items-center bg-[#F4F7FB] px-4 py-3 border-b border-[#DDE3EE]">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-[#1E72E7] text-[10px] font-bold text-white">
                    #{index + 1}
                  </div>
                  <span className="ml-3 text-sm font-bold text-[#374C6B]">{bt('generated.taskN', { n: index + 1 })}</span>
                  <button
                    onClick={() => removeTask(index)}
                    className="ml-auto flex items-center gap-1.5 rounded-lg border border-[#DDE3EE] bg-white px-2.5 py-1 text-[10px] font-bold text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <MaterialSymbol name="close" size={14} color="currentColor" />
                    {bt('delete')}
                  </button>
                </div>

                {/* Task Body */}
                <div className="p-4 space-y-4">
                  {/* Name */}
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#8497B4]">{bt('name')}</label>
                    <div className="relative flex items-center">
                      <div className="absolute left-3 text-[#B0C9F0]">
                        <MaterialSymbol name="title" size={16} color="currentColor" />
                      </div>
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) => handleTaskChange(index, { title: e.target.value })}
                        className="h-10 w-full rounded-lg border border-[#DDE3EE] bg-[#F9FBFE] pl-10 pr-4 text-sm text-[#0A1628] focus:border-[#1E72E7] outline-none"
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#8497B4]">{bt('description')}</label>
                    <div className="relative flex">
                      <div className="absolute left-3 top-3 text-[#B0C9F0]">
                        <MaterialSymbol name="description" size={16} color="currentColor" />
                      </div>
                      <textarea
                        value={task.description}
                        onChange={(e) => handleTaskChange(index, { description: e.target.value })}
                        rows={2}
                        className="w-full rounded-lg border border-[#DDE3EE] bg-[#F9FBFE] pl-10 pr-4 py-2.5 text-sm text-[#0A1628] focus:border-[#1E72E7] outline-none resize-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Board */}
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#8497B4]">{bt('page.board')}</label>
                      <AppSelect
                          value={task.board_id || ''}
                          onChange={(boardId) => handleTaskChange(index, { board_id: boardId, column_id: '', sprint_id: '' })}
                          options={[{ value: '', label: bt('generated.pickBoard') }, ...boards.map((board) => ({ value: board.id, label: board.name }))]}
                          showButtonAvatar={false}
                          showOptionAvatar={false}
                          buttonClassName="!h-10 !rounded-lg !bg-[#F9FBFE]"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Column */}
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#8497B4]">{bt('history.fields.column_id')}</label>
                        <AppSelect
                          value={task.column_id || ''}
                          onChange={(columnId) => handleTaskChange(index, { column_id: columnId })}
                          options={[{ value: '', label: bt('generated.pickColumn') }, ...columns.map((item: { column: { id: string; name: string } }) => ({ value: item.column.id, label: item.column.name }))]}
                          showButtonAvatar={false}
                          showOptionAvatar={false}
                          buttonClassName="!h-10 !rounded-lg !bg-[#F9FBFE]"
                        />
                      </div>

                      {/* Sprint */}
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#8497B4]">{bt('createTask.sprint')}</label>
                        <AppSelect
                          value={task.sprint_id || ''}
                          onChange={(sprintId) => handleTaskChange(index, { sprint_id: sprintId })}
                          options={[{ value: '', label: bt('createTask.noSprint') }, ...sprints.map((sprint: { id: string; name: string }) => ({ value: sprint.id, label: sprint.name }))]}
                          showButtonAvatar={false}
                          showOptionAvatar={false}
                          buttonClassName="!h-10 !rounded-lg !bg-[#F9FBFE]"
                        />
                      </div>
                    </div>

                    {/* Priority & Estimate */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#8497B4]">{bt('list.priority')}</label>
                          <AppSelect
                            value={task.priority}
                            onChange={(priority) => handleTaskChange(index, { priority: priority as TzAiPriority })}
                            options={[{ value: 'low', label: bt('priority.low') }, { value: 'medium', label: bt('priority.medium') }, { value: 'high', label: bt('priority.high') }]}
                            showButtonAvatar={false}
                            showOptionAvatar={false}
                            buttonClassName="!h-10 !rounded-lg !bg-[#F9FBFE]"
                          />
                      </div>

                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#8497B4]">{bt('generated.estimate')}</label>
                        <div className="relative flex items-center">
                          <div className="absolute left-3 text-[#B0C9F0]">
                             <MaterialSymbol name="schedule" size={16} color="currentColor" />
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={task.original_estimate_sec ? +(task.original_estimate_sec / 3600).toFixed(2) : ''}
                            onChange={(e) => {
                              const hours = parseFloat(e.target.value);
                              handleTaskChange(index, { original_estimate_sec: isNaN(hours) ? 0 : Math.round(hours * 3600) });
                            }}
                            className="h-10 w-full rounded-lg border border-[#DDE3EE] bg-[#F9FBFE] pl-10 pr-4 text-sm text-[#0A1628] focus:border-[#1E72E7] outline-none"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Assignee */}
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#8497B4]">{bt('history.fields.assignee_id')}</label>
                      <AppSelect
                          value={task.assignee_id ? String(task.assignee_id) : ''}
                          onChange={(assigneeId) => handleTaskChange(index, { assignee_id: assigneeId ? Number(assigneeId) : null })}
                          options={[{ value: '', label: bt('list.unassigned') }, ...members.map((member: { user_id: number; name: string }) => ({ value: String(member.user_id), label: member.name }))]}
                          showButtonAvatar={false}
                          showOptionAvatar={false}
                          buttonClassName="!h-10 !rounded-lg !bg-[#F9FBFE]"
                        />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Create Button */}
        <div className="mx-auto max-w-4xl mt-8 pb-10">
          <button
            onClick={() => onConfirm(editedTasks)}
            disabled={editedTasks.length === 0}
            className="group relative flex w-full h-14 items-center justify-center overflow-hidden rounded-2xl bg-linear-to-r from-[#1E72E7] to-[#1861CA] px-8 text-sm font-extrabold text-white shadow-[0_8px_25px_rgba(30,114,231,0.35)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_35px_rgba(30,114,231,0.45)] active:translate-y-0 disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 bg-white/10 opacity-0 transition-opacity group-hover:opacity-100" />
            <MaterialSymbol name="add_task" size={22} color="white" />
            <span className="ml-3">
              {editedTasks.length === 1 ? bt('generated.createOne') : bt('generated.createMany', { count: editedTasks.length })}
            </span>
          </button>
          
          <p className="mt-4 text-center text-xs font-medium text-[#8497B4]">
            {bt('generated.hint')}
          </p>
        </div>
      </div>
    </div>
  );
};
