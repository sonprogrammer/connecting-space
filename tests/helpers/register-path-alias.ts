import Module from "node:module";
import path from "node:path";

type ResolveFilename = (
  request: string,
  parent: NodeModule | undefined,
  isMain?: boolean,
  options?: unknown,
) => string;

const moduleResolver = Module as unknown as {
  _resolveFilename: ResolveFilename;
};

let registered = false;

export function registerPathAlias() {
  if (registered) {
    return;
  }

  const originalResolveFilename = moduleResolver._resolveFilename;
  const compiledSourceRoot = path.resolve(process.cwd(), ".test-dist/src");

  moduleResolver._resolveFilename = function resolveFilename(
    request,
    parent,
    isMain,
    options,
  ) {
    const resolvedRequest = request.startsWith("@/")
      ? path.join(compiledSourceRoot, request.slice(2))
      : request;

    return originalResolveFilename.call(
      this,
      resolvedRequest,
      parent,
      isMain,
      options,
    );
  };

  registered = true;
}
