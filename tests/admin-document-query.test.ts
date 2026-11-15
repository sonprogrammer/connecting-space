import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  adminProjectDocumentQueryKeys,
  fetchAdminProjectDocument,
  fetchAdminProjectDocumentVersion,
  generateAdminProjectDocument,
  saveAdminProjectDocument,
  AdminDocumentQueryError,
} from "../src/entities/document/model/admin-document-queries";

const projectId = "11111111-1111-4111-8111-111111111111";
const requestKey = "22222222-2222-4222-8222-222222222222";

describe("admin document query model", () => {
  test("admin document query keys distinguish project, kind, page, and version", () => {
    assert.notDeepEqual(
      adminProjectDocumentQueryKeys.detail(projectId, "proposal", 1),
      adminProjectDocumentQueryKeys.detail(projectId, "proposal", 2),
    );
    assert.notDeepEqual(
      adminProjectDocumentQueryKeys.detail(projectId, "proposal"),
      adminProjectDocumentQueryKeys.detail(projectId, "contract"),
    );
    assert.notDeepEqual(
      adminProjectDocumentQueryKeys.detail(projectId, "proposal"),
      adminProjectDocumentQueryKeys.detail("33333333-3333-4333-8333-333333333333", "proposal"),
    );
    assert.notDeepEqual(
      adminProjectDocumentQueryKeys.detail(projectId, "proposal"),
      adminProjectDocumentQueryKeys.version(projectId, "proposal", 1),
    );
  });

  test("admin document query GETs use the API URL and disable browser caching", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return Response.json({ data: { document: null, versions: [], pagination: { page: 2 }, jobs: [] } });
    };
    try {
      await fetchAdminProjectDocument(projectId, "proposal", 2);
      await fetchAdminProjectDocumentVersion(projectId, "contract", 4);
      assert.equal(requests[0].url, `/api/admin/projects/${projectId}/documents?type=proposal&page=2&pageSize=20`);
      assert.equal(requests[0].init?.cache, "no-store");
      assert.equal(requests[1].url, `/api/admin/projects/${projectId}/documents?type=contract&version=4`);
      assert.equal(requests[1].init?.cache, "no-store");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("admin document query errors hide API details and preserve status", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json(
      { error: { code: "ADMIN_AUTH_REQUIRED", message: "private server detail" } },
      { status: 401 },
    );
    try {
      await assert.rejects(
        fetchAdminProjectDocument(projectId, "proposal"),
        (error: unknown) => error instanceof AdminDocumentQueryError
          && error.status === 401
          && error.isAuthExpired
          && !error.message.includes("private server detail"),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("admin document query generation and save forward only contract payloads", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return Response.json({ data: { status: "processing" } }, { status: 202 });
    };
    const content = { title: "검토 초안", summary: "기술 범위 설명", scopeItems: ["화면 구성"] };
    try {
      await generateAdminProjectDocument(projectId, { type: "proposal", requestKey, retry: true });
      await saveAdminProjectDocument(projectId, {
        type: "contract", requestKey, expectedRevision: 2, content,
      });
      assert.equal(requests[0].url, `/api/admin/projects/${projectId}/documents`);
      assert.equal(requests[0].init?.method, "POST");
      assert.deepEqual(JSON.parse(String(requests[0].init?.body)), { type: "proposal", requestKey, retry: true });
      assert.equal(requests[1].init?.method, "PATCH");
      assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
        type: "contract", requestKey, expectedRevision: 2, content,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
