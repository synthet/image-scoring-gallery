import path from 'path';
import type { IpcMain } from 'electron';
import type { ApiService } from '../apiService';
import { resolveSortOptions } from '../scoringModels';
import { wrapIpcHandler } from './wrapIpcHandler';

export type ApiHandlersDeps = {
    ipcMain: IpcMain;
    apiService: ApiService;
    electronDirname: string;
};

export function registerApiHandlers(deps: ApiHandlersDeps): void {
    const { ipcMain, apiService, electronDirname } = deps;

    ipcMain.handle('api:health', wrapIpcHandler(async () => {
        return await apiService.healthCheck();
    }));

    ipcMain.handle('api:is-available', wrapIpcHandler(async () => {
        return await apiService.isAvailable();
    }));

    ipcMain.handle('api:status', wrapIpcHandler(async () => {
        return await apiService.getStatus();
    }));

    ipcMain.handle('api:stats', wrapIpcHandler(async () => {
        return await apiService.getStats();
    }));

    ipcMain.handle('api:get-scoring-sort-options', wrapIpcHandler(async () => {
        return await resolveSortOptions(apiService, path.resolve(electronDirname, '..'));
    }));

    ipcMain.handle('api:get-stack-analytics', wrapIpcHandler(async (_, stackId: number) => {
        return await apiService.getStackAnalytics(stackId);
    }));

    ipcMain.handle('api:get-agent-cull-groups', wrapIpcHandler(async (_, params?: {
        stackId?: number;
        subStackId?: number;
        status?: string;
        limit?: number;
        offset?: number;
    }) => {
        return await apiService.getAgentCullGroups(params);
    }));

    ipcMain.handle('api:get-agent-cull-group', wrapIpcHandler(async (_, groupId: number) => {
        return await apiService.getAgentCullGroup(groupId);
    }));

    ipcMain.handle('api:run-agent-cull-review', wrapIpcHandler(async (_, body: {
        stackId: number;
        subStackId?: number | null;
        dryRun?: boolean;
        force?: boolean;
        agent?: string;
    }) => {
        return await apiService.runAgentCullReview(body);
    }));

    ipcMain.handle('api:apply-agent-cull-candidates', wrapIpcHandler(async (_, groupId: number, body?: {
        recommendationIds?: number[];
        actor?: string;
        note?: string;
    }) => {
        return await apiService.applyAgentCullCandidates(groupId, body);
    }));

    ipcMain.handle('api:delete-approved-agent-cull', wrapIpcHandler(async (_, groupId: number, body: {
        confirm: boolean;
        actor?: string;
    }) => {
        return await apiService.deleteApprovedAgentCullCandidates(groupId, body);
    }));

    ipcMain.handle('api:approve-agent-cull-group', wrapIpcHandler(async (_, groupId: number, body?: {
        recommendationIds?: number[];
        actor?: string;
        note?: string;
    }) => {
        return await apiService.approveAgentCullGroup(groupId, body);
    }));

    ipcMain.handle('api:reject-agent-cull-group', wrapIpcHandler(async (_, groupId: number, body?: {
        recommendationIds?: number[];
        actor?: string;
        note?: string;
    }) => {
        return await apiService.rejectAgentCullGroup(groupId, body);
    }));

    ipcMain.handle('api:rollback-agent-cull-recommendation', wrapIpcHandler(async (_, recommendationId: number, body?: {
        actor?: string;
        note?: string;
    }) => {
        return await apiService.rollbackAgentCullRecommendation(recommendationId, body);
    }));

    ipcMain.handle('api:update-image-pick-status', wrapIpcHandler(async (_, imageId: number, pickStatus: -1 | 0 | 1) => {
        return await apiService.updateImagePickStatus(imageId, pickStatus);
    }));

    ipcMain.handle('api:scoring-start', wrapIpcHandler(async (_, opts) => {
        return await apiService.startScoring(opts);
    }));

    ipcMain.handle('api:scoring-stop', wrapIpcHandler(async () => {
        return await apiService.stopScoring();
    }));

    ipcMain.handle('api:scoring-status', wrapIpcHandler(async () => {
        return await apiService.getScoringStatus();
    }));

    ipcMain.handle('api:scoring-single', wrapIpcHandler(async (_, filePath: string) => {
        return await apiService.scoreSingleImage(filePath);
    }));

    ipcMain.handle('api:scoring-fix-image', wrapIpcHandler(async (_, filePath: string) => {
        return await apiService.fixImage(filePath);
    }));

    ipcMain.handle('api:tagging-start', wrapIpcHandler(async (_, opts) => {
        return await apiService.startTagging(opts);
    }));

    ipcMain.handle('api:tagging-stop', wrapIpcHandler(async () => {
        return await apiService.stopTagging();
    }));

    ipcMain.handle('api:tagging-status', wrapIpcHandler(async () => {
        return await apiService.getTaggingStatus();
    }));

    ipcMain.handle('api:tagging-single', wrapIpcHandler(async (_, opts) => {
        return await apiService.tagSingleImage(opts);
    }));

    ipcMain.handle('api:tagging-propagate', wrapIpcHandler(async (_, opts) => {
        return await apiService.propagateTags(opts);
    }));

    ipcMain.handle('api:clustering-start', wrapIpcHandler(async (_, opts) => {
        return await apiService.startClustering(opts);
    }));

    ipcMain.handle('api:clustering-stop', wrapIpcHandler(async () => {
        return await apiService.stopClustering();
    }));

    ipcMain.handle('api:clustering-status', wrapIpcHandler(async () => {
        return await apiService.getClusteringStatus();
    }));

    ipcMain.handle('api:pipeline-submit', wrapIpcHandler(async (_, opts) => {
        return await apiService.submitPipeline(opts);
    }));

    ipcMain.handle('api:pipeline-skip', wrapIpcHandler(async (_, opts) => {
        return await apiService.skipPipelinePhase(opts);
    }));

    ipcMain.handle('api:pipeline-retry', wrapIpcHandler(async (_, opts) => {
        return await apiService.retryPipelinePhase(opts);
    }));

    ipcMain.handle('api:status-all', wrapIpcHandler(async () => {
        return await apiService.getAllStatus();
    }));

    ipcMain.handle('api:jobs-queue', wrapIpcHandler(async (_, limit?: number) => {
        return await apiService.getJobsQueue(limit);
    }));

    ipcMain.handle('api:job-cancel', wrapIpcHandler(async (_, jobId: string | number) => {
        return await apiService.cancelJob(jobId);
    }));

    ipcMain.handle('api:jobs-recent', wrapIpcHandler(async () => {
        return await apiService.getRecentJobs();
    }));

    ipcMain.handle('api:job-detail', wrapIpcHandler(async (_, jobId: string | number) => {
        return await apiService.getJob(jobId);
    }));

    ipcMain.handle('api:get-scope-tree', wrapIpcHandler(async () => {
        return await apiService.getScopeTree();
    }));
}
