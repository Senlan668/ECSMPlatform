# Student Report Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让学生管理和喜报素材库共用同一套喜报图片数据，并支持学生主喜报的上传、选择、预览、替换、解绑和素材侧补关联。

**Architecture:** 以 `students.main_report_material_id -> materials.id` 作为唯一关联真相。学生侧持有主喜报外键，素材侧通过查询反查“是否已绑定学生”，不做双写持久化。上传入口保留两处，但都落到同一条 `materials(category='report')` 记录上。

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React 18, TypeScript, Axios, Node built-in test runner, Python unittest

---

## File Map

### Backend model and schema

- Modify: `backend/app/models/student.py`
- Modify: `backend/app/models/chat.py`
- Modify: `backend/app/services/schema_sync.py`
- Test: `backend/tests/test_schema_sync.py`

### Backend student/material routing

- Modify: `backend/app/routers/students.py`
- Modify: `backend/app/routers/materials.py`
- Test: `backend/tests/test_student_report_binding.py`

### Frontend data and API layer

- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/components/studentManagementModel.ts`
- Test: `frontend/tests/studentManagementModel.test.ts`

### Frontend student UI

- Modify: `frontend/src/components/StudentManagement.tsx`
- Create: `frontend/src/components/StudentReportPicker.tsx`
- Create: `frontend/src/components/StudentReportPreview.tsx`

### Frontend material UI

- Modify: `frontend/src/components/MaterialView.tsx`

---

### Task 1: Add student main-report schema

**Files:**
- Modify: `backend/app/models/student.py`
- Modify: `backend/app/services/schema_sync.py`
- Test: `backend/tests/test_schema_sync.py`

- [ ] **Step 1: Write the failing backend schema test**

Add a test asserting old `students` tables now require the new nullable report field:

```python
def test_legacy_student_schema_requires_main_report_material_id(self):
    existing_columns = {
        'id', 'name', 'channel', 'job_title', 'pre_salary', 'post_salary',
        'bday', 'enroll_date', 'graduation_date', 'phone',
        'douyin_order', 'class_name', 'status', 'created_at', 'updated_at',
    }
    missing = get_missing_student_columns(existing_columns)
    self.assertEqual(missing, [('main_report_material_id', 'INTEGER')])
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
python3 -m unittest backend/tests/test_schema_sync.py
```

Expected: FAIL because student schema sync helper does not exist yet.

- [ ] **Step 3: Add minimal schema support**

Update `Student` model:

```python
main_report_material_id = Column(Integer, nullable=True, index=True)
```

Update schema sync service with a student-table helper parallel to existing raw/material helpers:

```python
def get_missing_student_columns(existing_columns):
    ...
    return [('main_report_material_id', 'INTEGER')] if missing else []
```

And call it from the public schema patch function used on startup/migration.

- [ ] **Step 4: Run schema tests to verify they pass**

Run:

```bash
python3 -m unittest backend/tests/test_schema_sync.py
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/student.py backend/app/services/schema_sync.py backend/tests/test_schema_sync.py
git commit -m "feat: add student main report schema"
```

### Task 2: Return student main-report data from API

**Files:**
- Modify: `backend/app/routers/students.py`
- Test: `backend/tests/test_student_report_binding.py`

- [ ] **Step 1: Write the failing API response test**

Create a focused test file for student-report binding. First test should cover list/detail serialization:

```python
def test_student_response_includes_main_report_summary(self):
    report = Material(id=1, category='report', filename='x.png', stored_name='x', file_type='image/png')
    student = Student(name='张三', main_report_material_id=1)
    ...
    result = get_student(student.id, db=self.db)
    self.assertEqual(result.main_report_material_id, 1)
    self.assertEqual(result.main_report_material['id'], 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
python3 -m unittest backend/tests/test_student_report_binding.py
```

Expected: FAIL because response model does not expose report fields.

- [ ] **Step 3: Add response model and query hydration**

Extend `StudentResponse` and `StudentData` shape:

```python
class MaterialSummary(BaseModel):
    id: int
    filename: str
    title: Optional[str] = None
    file_type: str
    category: str
    oss_key: Optional[str] = None
    created_at: datetime

class StudentResponse(BaseModel):
    ...
    main_report_material_id: Optional[int] = None
    main_report_material: Optional[MaterialSummary] = None
```

Use a serializer helper instead of returning raw ORM directly:

```python
def to_student_response(student: Student, report: Optional[Material]) -> StudentResponse:
    ...
```

- [ ] **Step 4: Verify the API test passes**

Run:

```bash
python3 -m unittest backend/tests/test_student_report_binding.py
```

Expected: PASS for response serialization case.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/students.py backend/tests/test_student_report_binding.py
git commit -m "feat: expose student main report in api"
```

### Task 3: Implement bind and unbind endpoints

**Files:**
- Modify: `backend/app/routers/students.py`
- Test: `backend/tests/test_student_report_binding.py`

- [ ] **Step 1: Write failing bind/unbind tests**

Add these tests:

```python
def test_bind_unbound_report_to_student(self): ...

def test_reject_binding_non_report_material(self): ...

def test_reject_binding_report_already_used_by_other_student(self): ...

def test_replace_student_report_keeps_old_material_unbound(self): ...

def test_unbind_student_report(self): ...
```

Each test should call route functions directly with an in-memory SQLite DB and assert status/result.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python3 -m unittest backend/tests/test_student_report_binding.py
```

Expected: FAIL because endpoints do not exist.

- [ ] **Step 3: Add minimal bind/unbind API**

In `backend/app/routers/students.py`, add:

```python
class BindMainReportRequest(BaseModel):
    material_id: int

@router.put("/{student_id}/main-report", response_model=StudentResponse)
def bind_main_report(...):
    # validate student
    # validate material exists and category == 'report'
    # reject folder rows
    # reject if another student already points to this material
    # assign material_id to student.main_report_material_id
    # return hydrated response

@router.delete("/{student_id}/main-report", response_model=StudentResponse)
def unbind_main_report(...):
    # set student.main_report_material_id = None
```

Use `409` for “already bound by another student”.

- [ ] **Step 4: Verify tests pass**

Run:

```bash
python3 -m unittest backend/tests/test_student_report_binding.py
```

Expected: PASS for bind/unbind and constraint cases.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/students.py backend/tests/test_student_report_binding.py
git commit -m "feat: add student main report binding endpoints"
```

### Task 4: Guard deletion and support upload-time binding

**Files:**
- Modify: `backend/app/routers/materials.py`
- Test: `backend/tests/test_student_report_binding.py`

- [ ] **Step 1: Write the failing materials tests**

Add tests for:

```python
def test_proxy_upload_can_bind_report_to_student(self): ...

def test_delete_bound_report_is_blocked(self): ...
```

The upload test can target the pure binding helper instead of real TOS upload if needed.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
python3 -m unittest backend/tests/test_student_report_binding.py
```

Expected: FAIL because materials router does not understand student binding.

- [ ] **Step 3: Implement minimal material-side support**

In `backend/app/routers/materials.py`:

1. Extend upload handlers to accept optional `student_id`

```python
student_id: Optional[int] = Form(None)
```

2. After material creation, if `student_id` is present and `category == 'report'`, reuse the same student-binding logic.

3. Extend delete handler to block deleting a report currently referenced by any student:

```python
bound_student = db.query(Student).filter(Student.main_report_material_id == material.id).first()
if bound_student:
    raise HTTPException(status_code=409, detail="该喜报已关联学生 请先解绑")
```

4. Add derived fields to material list/detail serialization:

```python
bound_student_id
bound_student_name
```

- [ ] **Step 4: Re-run backend tests**

Run:

```bash
python3 -m unittest backend/tests/test_student_report_binding.py backend/tests/test_schema_sync.py
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/materials.py backend/tests/test_student_report_binding.py
git commit -m "feat: connect report uploads and deletion rules to students"
```

### Task 5: Extend frontend API and student view model

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/components/studentManagementModel.ts`
- Test: `frontend/tests/studentManagementModel.test.ts`

- [ ] **Step 1: Write the failing frontend model test**

Add cases covering `main_report_material_id` and summary mapping:

```ts
assert.equal(view.mainReportMaterialId, 12)
assert.equal(view.mainReportMaterial?.id, 12)
assert.equal(view.mainReportMaterial?.category, 'report')
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --test frontend/tests/studentManagementModel.test.ts
```

Expected: FAIL because model types do not include report fields.

- [ ] **Step 3: Add minimal API/model support**

Update `frontend/src/api.ts` student interfaces:

```ts
export interface MaterialSummaryData {
  id: number
  filename: string
  title: string | null
  file_type: string
  category: string
  oss_key: string | null
  created_at: string
}

main_report_material_id: number | null
main_report_material: MaterialSummaryData | null
```

Add API methods:

```ts
bindStudentMainReport(studentId: number, materialId: number)
unbindStudentMainReport(studentId: number)
```

Update `StudentView` and mapping helpers in `studentManagementModel.ts`.

- [ ] **Step 4: Re-run model tests**

Run:

```bash
node --experimental-strip-types --test frontend/tests/studentManagementModel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/components/studentManagementModel.ts frontend/tests/studentManagementModel.test.ts
git commit -m "feat: add student report fields to frontend models"
```

### Task 6: Add student-side report preview and actions

**Files:**
- Modify: `frontend/src/components/StudentManagement.tsx`
- Create: `frontend/src/components/StudentReportPreview.tsx`
- Create: `frontend/src/components/StudentReportPicker.tsx`

- [ ] **Step 1: Write a small pure test for preview/picker selection logic**

Create a focused test file:

```ts
test('picker excludes already bound reports except current student report', () => {
  ...
})
```

If extracting a pure helper is cleaner, test the helper rather than JSX.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --test frontend/tests/studentReportPicker.test.ts
```

Expected: FAIL because helper/component does not exist.

- [ ] **Step 3: Implement minimal student UI**

1. Add preview component that shows:
   - thumbnail or placeholder
   - filename/title
   - upload time
   - buttons: `上传新喜报` / `从素材库选择` / `解绑`

2. Add picker component:
   - fetch `getMaterials({ category: 'report', all_folders: true, unbound_only: true })`
   - allow search/select one item

3. Integrate into `StudentManagement.tsx` form modal:

```tsx
<StudentReportPreview ... />
<StudentReportPicker ... />
```

4. On upload:
   - call `proxyUploadMaterial(file, 'report')`
   - then `bindStudentMainReport(student.id, material.id)` for existing students
   - for new students, defer binding until after create succeeds

5. On save for new students:
   - create student first
   - if a pending report was uploaded/selected, bind it afterwards

- [ ] **Step 4: Run the focused frontend tests**

Run:

```bash
node --experimental-strip-types --test frontend/tests/studentReportPicker.test.ts
```

Expected: PASS.

- [ ] **Step 5: Build the frontend**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/StudentManagement.tsx frontend/src/components/StudentReportPreview.tsx frontend/src/components/StudentReportPicker.tsx frontend/tests/studentReportPicker.test.ts
git commit -m "feat: manage main report from student module"
```

### Task 7: Add material-side student binding UI

**Files:**
- Modify: `frontend/src/components/MaterialView.tsx`

- [ ] **Step 1: Write a failing pure test for material binding status formatting**

Add a small test file or helper around derived status labels:

```ts
test('material binding label shows student name when bound', () => {
  ...
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --test frontend/tests/materialBindingStatus.test.ts
```

Expected: FAIL because helper or label logic does not exist.

- [ ] **Step 3: Implement minimal material-side binding flow**

In `MaterialView.tsx`:

1. Show binding badge on report cards/details:

```tsx
{material.bound_student_name ? '已关联：张三' : '未关联'}
```

2. For unbound reports, add `关联学生` action.

3. Reuse a simple student selector modal fed by `getStudents({ page: 1, page_size: 100 })`.

4. On select, call `bindStudentMainReport(studentId, material.id)`.

5. Refresh material list and, if needed, affected student data.

- [ ] **Step 4: Run focused test and frontend build**

Run:

```bash
node --experimental-strip-types --test frontend/tests/materialBindingStatus.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MaterialView.tsx frontend/tests/materialBindingStatus.test.ts
git commit -m "feat: bind reports to students from material module"
```

### Task 8: End-to-end verification and cleanup

**Files:**
- Verify only; no required code files

- [ ] **Step 1: Run backend regression suite**

Run:

```bash
python3 -m unittest backend/tests/test_student_report_binding.py backend/tests/test_schema_sync.py
```

Expected: PASS.

- [ ] **Step 2: Run frontend regression suite**

Run:

```bash
node --experimental-strip-types --test frontend/tests/studentManagementModel.test.ts
node --experimental-strip-types --test frontend/tests/studentReportPicker.test.ts
node --experimental-strip-types --test frontend/tests/materialBindingStatus.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Manual verification checklist**

Verify in UI:

1. 学生管理可上传并绑定新喜报
2. 学生管理可从未关联喜报中选择绑定
3. 学生更换喜报后旧图仍在素材库且显示未关联
4. 喜报模块上传后默认未关联
5. 喜报模块可补关联学生
6. 已绑定喜报删除被拦截
7. 学生解绑后喜报重新变成未关联

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: connect student management with report materials"
```

## Notes for the implementing agent

- 不要给 `materials` 再落一个 `bound_student_id`，那会引入双写。
- 绑定逻辑必须只认 `students.main_report_material_id`。
- 先保证“一个学生一张主喜报”的主链路，再做体验优化。
- 历史数据不迁移，不要写批量回填脚本。
- 删除保护必须优先于 UI 按钮隐藏，后端接口是最终约束。
