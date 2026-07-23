# Report Folder Drag Move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为“成交喜报”视图增加拖拽归档能力，支持把喜报素材卡片拖入文件夹卡片，或拖回根目录，并在拖放成功后立即持久化到数据库。

**Architecture:** 后端新增独立 `PUT /api/materials/{material_id}/move` 接口，只负责校验并更新 `folder_id`。前端保持 `MaterialView` 为主容器，但把拖拽规则和成功后的本地刷新策略抽成小 helper，避免把已有素材预览、上传、文件夹管理逻辑继续塞进同一个大组件里。

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React 18, TypeScript, Axios, Node built-in test runner, Python unittest

---

## File Map

### Backend move API

- Modify: `backend/app/routers/materials.py`
- Test: `backend/tests/test_material_folder_move.py`

### Frontend API and drag rules

- Modify: `frontend/src/api.ts`
- Create: `frontend/src/components/materialFolderMove.ts`
- Test: `frontend/tests/materialFolderMove.test.ts`

### Frontend MaterialView integration

- Modify: `frontend/src/components/MaterialView.tsx`

---

### Task 1: Add backend material move API

**Files:**
- Modify: `backend/app/routers/materials.py`
- Test: `backend/tests/test_material_folder_move.py`

- [ ] **Step 1: Write the failing backend move tests**

Create `backend/tests/test_material_folder_move.py` with focused route-level tests:

```python
def test_move_report_material_to_folder_success(self):
    report = Material(category="report", file_type="image/png", folder_id=None, ...)
    folder = Material(category="report", file_type="folder", folder_id=None, ...)
    result = move_material(report.id, MaterialMoveRequest(folder_id=folder.id), db=self.db)
    self.assertEqual(result.folder_id, folder.id)

def test_move_report_material_to_root_success(self): ...

def test_reject_move_for_non_report_material(self): ...

def test_reject_move_for_folder_material(self): ...

def test_reject_move_to_same_folder(self): ...

def test_reject_move_to_cross_category_folder(self): ...
```

- [ ] **Step 2: Run the backend tests to verify they fail**

Run:

```bash
python3 -m unittest backend/tests/test_material_folder_move.py
```

Expected: FAIL because the move request model and route do not exist yet.

- [ ] **Step 3: Implement the minimal move API**

In `backend/app/routers/materials.py`, add a dedicated request model:

```python
class MaterialMoveRequest(BaseModel):
    folder_id: Optional[int] = None
```

Add a dedicated route:

```python
@router.put("/{material_id}/move", response_model=MaterialResponse)
def move_material(material_id: int, req: MaterialMoveRequest, db: DBSession = Depends(get_db)):
    material = db.query(Material).filter(Material.id == material_id).first()
    ...
```

Minimal required checks:

```python
if not material:
    raise HTTPException(status_code=404, detail="素材不存在")
if material.file_type == "folder":
    raise HTTPException(status_code=400, detail="文件夹不能被移动")
if material.category != "report":
    raise HTTPException(status_code=400, detail="仅支持移动喜报素材")
if req.folder_id is not None:
    folder = db.query(Material).filter(Material.id == req.folder_id, Material.file_type == "folder").first()
    ...
    if folder.category != material.category:
        raise HTTPException(status_code=409, detail="不能移动到不同分类的文件夹")
if material.folder_id == req.folder_id:
    raise HTTPException(status_code=409, detail="素材已在目标目录中")
material.folder_id = req.folder_id
db.commit()
db.refresh(material)
return MaterialResponse.model_validate(serialize_material_response(material, get_material_bound_student(db, material.id)))
```

- [ ] **Step 4: Re-run the backend tests**

Run:

```bash
python3 -m unittest backend/tests/test_material_folder_move.py
```

Expected: PASS.

- [ ] **Step 5: Commit the backend move API**

```bash
git add backend/app/routers/materials.py backend/tests/test_material_folder_move.py
git commit -m "feat: add report material move api"
```

---

### Task 2: Add frontend move API and drag-rule helper

**Files:**
- Modify: `frontend/src/api.ts`
- Create: `frontend/src/components/materialFolderMove.ts`
- Test: `frontend/tests/materialFolderMove.test.ts`

- [ ] **Step 1: Write the failing frontend drag-rule tests**

Create `frontend/tests/materialFolderMove.test.ts`:

```ts
test('getMoveTarget rejects same folder moves', () => {
  assert.equal(
    getMoveTarget({ currentFolderId: 12, targetFolderId: 12, searchQuery: '' }),
    null,
  )
})

test('getMoveTarget returns root move payload', () => {
  assert.deepEqual(
    getMoveTarget({ currentFolderId: 8, targetFolderId: null, searchQuery: '' }),
    { folder_id: null, successMessage: '已移回根目录' },
  )
})

test('search mode disables drag move', () => { ... })
```

Include a small reducer-style helper test for optimistic list cleanup if the item leaves the current directory:

```ts
test('applyMovedMaterial removes moved item from current folder list', () => { ... })

test('buildMaterialMoveSuccessState clears drag markers after move', () => { ... })
```

- [ ] **Step 2: Run the frontend tests to verify they fail**

Run:

```bash
node --experimental-strip-types --test frontend/tests/materialFolderMove.test.ts
```

Expected: FAIL because helper module does not exist yet.

- [ ] **Step 3: Implement the helper and API method**

In `frontend/src/api.ts`, add:

```ts
export async function moveMaterial(materialId: number, folderId: number | null): Promise<Material> {
  const { data } = await api.put(`/materials/${materialId}/move`, { folder_id: folderId })
  return data
}
```

Create `frontend/src/components/materialFolderMove.ts` with focused pure helpers:

```ts
export interface MaterialMoveTarget {
  folder_id: number | null
  successMessage: string
}

export const getMoveTarget = ({ currentFolderId, targetFolderId, searchQuery }: ...): MaterialMoveTarget | null => {
  if (searchQuery.trim()) return null
  if (currentFolderId === targetFolderId) return null
  return {
    folder_id: targetFolderId,
    successMessage: targetFolderId == null ? '已移回根目录' : 'move-to-folder',
  }
}

export const removeMovedMaterialFromCurrentView = (materials: Material[], materialId: number) =>
  materials.filter((item) => item.id !== materialId)
```

Keep helper output small and deterministic. Do not add UI code here.

- [ ] **Step 4: Re-run the frontend tests**

Run:

```bash
node --experimental-strip-types --test frontend/tests/materialFolderMove.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the frontend helper layer**

```bash
git add frontend/src/api.ts frontend/src/components/materialFolderMove.ts frontend/tests/materialFolderMove.test.ts
git commit -m "feat: add report drag move helpers"
```

---

### Task 3: Wire drag-and-drop into MaterialView

**Files:**
- Modify: `frontend/src/components/MaterialView.tsx`
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/components/materialFolderMove.ts`
- Test: `frontend/tests/materialFolderMove.test.ts`

- [ ] **Step 1: Implement MaterialView drag state and handlers**

In `frontend/src/components/MaterialView.tsx`, add minimal drag state near existing folder/report state:

```ts
const [draggingMaterialId, setDraggingMaterialId] = useState<number | null>(null)
const [dropFolderId, setDropFolderId] = useState<number | null>(null)
const [dropOnRoot, setDropOnRoot] = useState(false)
const [movingMaterialId, setMovingMaterialId] = useState<number | null>(null)
```

Add handlers:

```ts
const handleMaterialDragStart = (material: Material) => { ... }
const handleFolderDragOver = (event: React.DragEvent, folder: FolderData) => { ... }
const handleFolderDrop = async (event: React.DragEvent, folder: FolderData) => { ... }
const handleRootDrop = async (event: React.DragEvent) => { ... }
const resetDragState = () => { ... }
```

Use `getMoveTarget(...)` before calling `moveMaterial(...)`.

On success:

```ts
setMaterials((prev) => buildMaterialMoveSuccessState(prev, draggedId).materials)
await fetchFolders('report', currentFolder?.id)
await fetchMaterials()
showToast(folder ? `已移动到「${folder.name}」` : '已移回根目录', 'success')
```

`filteredMaterials` is currently derived from `materials`, so不要试图直接 set `filteredMaterials`。所有即时移除都落在 `materials` 源状态上，然后再调用 `fetchMaterials()` 做服务端对齐。

Update JSX:

- root breadcrumb button becomes a drop target
- each folder card becomes a drop target
- each report card gets `draggable={!searchQuery && !movingMaterialId}`
- add hover classes for `dropFolderId` and `dropOnRoot`
- add opacity treatment for `draggingMaterialId`

- [ ] **Step 2: Build and verify**

Run:

```bash
node --experimental-strip-types --test frontend/tests/materialFolderMove.test.ts
(cd frontend && npm run build)
```

Expected:

- helper tests PASS
- production build PASS

- [ ] **Step 3: Commit MaterialView integration**

```bash
git add frontend/src/components/MaterialView.tsx frontend/src/components/materialFolderMove.ts frontend/tests/materialFolderMove.test.ts frontend/src/api.ts
git commit -m "feat: enable dragging reports into folders"
```

---

### Task 4: Full regression verification

**Files:**
- Verify only; no new files expected

- [ ] **Step 1: Run backend regression suite for materials**

Run:

```bash
python3 -m unittest backend/tests/test_material_folder_move.py backend/tests/test_student_report_binding.py
```

Expected: PASS.

- [ ] **Step 2: Run frontend regression suite**

Run:

```bash
node --experimental-strip-types --test frontend/tests/materialFolderMove.test.ts frontend/tests/studentImportModel.test.ts frontend/tests/studentManagementModel.test.ts frontend/tests/appRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run final production build**

Run:

```bash
cd frontend && npm run build
```

Expected: PASS with at most the existing chunk-size warning.

- [ ] **Step 4: Manual verification in browser**

In `http://localhost`:

1. 进入“成交喜报”根目录
2. 拖一张未进入文件夹的喜报到任意文件夹
3. 确认 toast 显示目标文件夹名
4. 确认当前列表中该喜报消失
5. 进入目标文件夹，确认该喜报存在
6. 再把该喜报拖到“成交喜报”面包屑标题
7. 确认它回到根目录
8. 搜索一个关键字，确认搜索结果页不出现可用拖拽归档

- [ ] **Step 5: Commit verification-only follow-up if needed**

Only if manual verification required a code change:

```bash
git add <files>
git commit -m "fix: polish report drag move flow"
```
