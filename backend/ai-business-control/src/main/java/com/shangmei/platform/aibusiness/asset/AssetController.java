package com.shangmei.platform.aibusiness.asset;

import com.shangmei.platform.aibusiness.asset.AssetModels.ClipTask;
import com.shangmei.platform.aibusiness.asset.AssetModels.CreateClipTask;
import com.shangmei.platform.aibusiness.asset.AssetModels.AudioExtractionUpdate;
import com.shangmei.platform.aibusiness.asset.AssetModels.Material;
import com.shangmei.platform.aibusiness.asset.AssetModels.RecordClipExport;
import com.shangmei.platform.aibusiness.asset.AssetModels.RenameClipTask;
import com.shangmei.platform.aibusiness.asset.AssetModels.SaveClipSegment;
import com.shangmei.platform.aibusiness.asset.AssetModels.SaveMaterial;
import com.shangmei.platform.aibusiness.identity.IdentityModels.TenantPrincipal;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

import static com.shangmei.platform.aibusiness.identity.TenantAuthenticationFilter.PRINCIPAL_ATTRIBUTE;

@RestController
@RequestMapping("/api/v1/assets")
public class AssetController {
    private final AssetService assetService;
    private final AssetRuntimeService assetRuntimeService;

    public AssetController(AssetService assetService, AssetRuntimeService assetRuntimeService) {
        this.assetService = assetService;
        this.assetRuntimeService = assetRuntimeService;
    }

    @GetMapping("/clip-tasks")
    public List<ClipTask> listClipTasks(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return assetService.listClipTasks(principal.tenantId());
    }

    @PostMapping("/clip-tasks")
    @ResponseStatus(HttpStatus.CREATED)
    public ClipTask createClipTask(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @Valid @RequestBody CreateClipTask input
    ) {
        return assetService.createClipTask(principal.tenantId(), input);
    }

    @PatchMapping("/clip-tasks/{taskId}")
    public ClipTask renameClipTask(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String taskId,
            @Valid @RequestBody RenameClipTask input
    ) {
        return assetRuntimeService.rename(principal.tenantId(), taskId, input);
    }

    @PostMapping("/clip-tasks/{taskId}/advance")
    public ClipTask advanceClipTask(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String taskId
    ) {
        return assetService.advanceClipTask(principal.tenantId(), taskId);
    }

    @PostMapping("/clip-tasks/{taskId}/audio-extraction")
    public ClipTask updateAudioExtraction(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String taskId,
            @Valid @RequestBody AudioExtractionUpdate input
    ) {
        return assetService.updateAudioExtraction(principal.tenantId(), taskId, input);
    }

    @PostMapping(path = "/clip-tasks/{taskId}/dispatch", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ClipTask dispatch(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String taskId,
            @RequestPart("audio") MultipartFile audio
    ) {
        return assetRuntimeService.dispatch(principal.tenantId(), taskId, audio);
    }

    @PostMapping(path = "/clip-tasks/{taskId}/dispatch-video", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ClipTask dispatchVideo(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String taskId,
            @RequestPart("video") MultipartFile video
    ) {
        return assetRuntimeService.dispatchVideo(principal.tenantId(), taskId, video);
    }

    @PostMapping("/clip-tasks/{taskId}/sync")
    public ClipTask syncRuntime(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String taskId
    ) {
        return assetRuntimeService.refresh(principal.tenantId(), taskId);
    }

    @PostMapping("/clip-tasks/{taskId}/retry")
    public ClipTask retryRuntime(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String taskId
    ) {
        return assetRuntimeService.retry(principal.tenantId(), taskId);
    }

    @PostMapping("/clip-tasks/{taskId}/segments")
    public ClipTask addSegment(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String taskId,
            @Valid @RequestBody SaveClipSegment input
    ) {
        return assetService.addSegment(principal.tenantId(), taskId, input);
    }

    @DeleteMapping("/clip-tasks/{taskId}/segments/{segmentId}")
    public ClipTask deleteSegment(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String taskId,
            @PathVariable String segmentId
    ) {
        return assetService.deleteSegment(principal.tenantId(), taskId, segmentId);
    }

    @PostMapping("/clip-tasks/{taskId}/segments/{segmentId}/viral-titles")
    public ClipTask generateViralTitles(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String taskId,
            @PathVariable String segmentId
    ) {
        return assetRuntimeService.generateViralTitles(principal.tenantId(), taskId, segmentId);
    }

    @PostMapping("/clip-tasks/{taskId}/segments/{segmentId}/editing-guide")
    public ClipTask generateEditingGuide(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String taskId,
            @PathVariable String segmentId
    ) {
        return assetRuntimeService.generateEditingGuide(principal.tenantId(), taskId, segmentId);
    }

    @PostMapping("/clip-tasks/{taskId}/exports")
    public ClipTask recordExport(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String taskId,
            @Valid @RequestBody RecordClipExport input
    ) {
        return assetService.recordExport(principal.tenantId(), taskId, input);
    }

    @DeleteMapping("/clip-tasks/{taskId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteClipTask(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String taskId
    ) {
        assetRuntimeService.delete(principal.tenantId(), taskId);
    }

    @GetMapping("/materials")
    public List<Material> listMaterials(@RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal) {
        return assetService.listMaterials(principal.tenantId());
    }

    @PostMapping("/materials")
    @ResponseStatus(HttpStatus.CREATED)
    public Material createMaterial(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @Valid @RequestBody SaveMaterial input
    ) {
        return assetService.createMaterial(principal.tenantId(), input);
    }

    @PostMapping("/materials/{materialId}/confirm")
    public Material confirmMaterial(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String materialId
    ) {
        return assetService.confirmMaterial(principal.tenantId(), materialId);
    }

    @DeleteMapping("/materials/{materialId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMaterial(
            @RequestAttribute(PRINCIPAL_ATTRIBUTE) TenantPrincipal principal,
            @PathVariable String materialId
    ) {
        assetService.deleteMaterial(principal.tenantId(), materialId);
    }
}
