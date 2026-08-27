"use client";

import type { ReactNode } from "react";
import MaintenanceRecordCard from "@/components/MaintenanceRecordCard";
import MaintenanceRecordEditForm from "./MaintenanceRecordEditForm";
import type { Engine, MaintenanceRecord, VideoItem } from "../_types";

interface RecordGroup {
  key: string;
  label: string;
  records: MaintenanceRecord[];
}

interface RecordListUser {
  role?: string;
  id?: string;
  _id?: string;
}

interface RecordListProps {
  recordGroups: RecordGroup[];
  user: RecordListUser | null | undefined;
  sortedEngines: Engine[];
  mediaLoadingId: string | null;
  confirmingId: string | null;
  editingId: string | null;
  confirmDeleteId: string | null;
  technicianLabel: (record: MaintenanceRecord) => string;
  getPhotoSrc: (photo: string) => string;
  getVideoSrc: (video: VideoItem | string) => string;
  onLoadMedia: (record: MaintenanceRecord) => void;
  onPhotoClick: (src: string) => void;
  onVideoClick: (src: string, filename: string) => void;
  onOpenDetails: (record: MaintenanceRecord) => void;
  onOpenConfirmation: (record: MaintenanceRecord) => void;
  onToggleEdit: (record: MaintenanceRecord) => void;
  onDeleteRequest: (record: MaintenanceRecord) => void;
  onDeleteConfirm: (record: MaintenanceRecord) => void;
  onDeleteCancel: () => void;
  onEditCancel: () => void;
  onEditSaved: () => void;
  children?: ReactNode;
}

export default function RecordList({
  recordGroups,
  user,
  sortedEngines,
  mediaLoadingId,
  confirmingId,
  editingId,
  confirmDeleteId,
  technicianLabel,
  getPhotoSrc,
  getVideoSrc,
  onLoadMedia,
  onPhotoClick,
  onVideoClick,
  onOpenDetails,
  onOpenConfirmation,
  onToggleEdit,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onEditCancel,
  onEditSaved,
}: RecordListProps) {
  return (
    <div className="flex flex-col gap-4">
      {recordGroups.map((group) => (
        <section key={group.key}>
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-border px-1 pb-1.5">
            <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-muted">{group.label}</h2>
            <span className="text-[10px] text-faint">{group.records.length} kayıt</span>
          </div>
          <div className="flex flex-col gap-2">
            {group.records.map((record) => {
              const canEdit = user && (user.role === "yonetici" || user.id === record.technician_id || user._id === record.technician_id);
              return (
                <MaintenanceRecordCard
                  key={record._id}
                  record={record}
                  technicianLabel={technicianLabel(record)}
                  canEdit={Boolean(canEdit)}
                  isManager={user?.role === "yonetici"}
                  isMediaLoading={mediaLoadingId === record._id}
                  isConfirming={confirmingId === record._id}
                  isEditing={editingId === record._id}
                  deletePending={confirmDeleteId === record._id}
                  getPhotoSrc={getPhotoSrc}
                  getVideoSrc={getVideoSrc}
                  onLoadMedia={() => onLoadMedia(record)}
                  onPhotoClick={onPhotoClick}
                  onVideoClick={onVideoClick}
                  onOpenDetails={() => onOpenDetails(record)}
                  onOpenConfirmation={() => onOpenConfirmation(record)}
                  onToggleEdit={() => onToggleEdit(record)}
                  onDeleteRequest={() => onDeleteRequest(record)}
                  onDeleteConfirm={() => onDeleteConfirm(record)}
                  onDeleteCancel={onDeleteCancel}
                  editForm={editingId === record._id ? (
                    <MaintenanceRecordEditForm
                      record={record}
                      onPhotoClick={onPhotoClick}
                      onCancel={onEditCancel}
                      onSaved={onEditSaved}
                      isAdmin={user?.role === "yonetici"}
                      engines={sortedEngines}
                    />
                  ) : null}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
