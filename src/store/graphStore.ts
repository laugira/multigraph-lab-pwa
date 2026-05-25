export interface Entity {
    id: number;
    name: string;
    type: string;
    color: string | null;
    description: string | null;
}

export interface RelationshipType {
    id: number;
    name: string;
    displayLabel: string | null;
    color: string;
    lineStyle: string;
    description: string | null;
}

export interface Relationship {
    id: number;
    source: Entity;
    target: Entity;
    type: RelationshipType;
    label: string | null;
    weight: string;
}

interface Database {
    entities: Entity[];
    relationships: Relationship[];
    relationshipTypes: RelationshipType[];
    nextEntityId: number;
    nextRelationshipId: number;
    nextTypeId: number;
}

const STORAGE_KEY = 'multigraph-lab-data';

function emptyDb(): Database {
    return {
        entities: [],
        relationships: [],
        relationshipTypes: [],
        nextEntityId: 1,
        nextRelationshipId: 1,
        nextTypeId: 1,
    };
}

function loadDb(): Database {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return emptyDb();
        const parsed = JSON.parse(raw) as Database;
        return { ...emptyDb(), ...parsed };
    } catch {
        return emptyDb();
    }
}

function saveDb(db: Database): boolean {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
        return true;
    } catch (err) {
        console.error('Failed to persist graph data:', err);
        return false;
    }
}

function persistOrFail(db: Database, response: Response): Response {
    return saveDb(db) ? response : textResponse('Storage full or unavailable', 507);
}

function cloneEntity(entity: Entity): Entity {
    return { ...entity };
}

function findEntity(db: Database, id: number): Entity | undefined {
    return db.entities.find(e => e.id === id);
}

function findTypeByName(db: Database, name: string): RelationshipType | undefined {
    return db.relationshipTypes.find(t => t.name === name);
}

function findTypeById(db: Database, id: number): RelationshipType | undefined {
    return db.relationshipTypes.find(t => t.id === id);
}

function syncTypeOnRelationships(db: Database, type: RelationshipType, previousName?: string) {
    db.relationships = db.relationships.map(rel => {
        const matches =
            rel.type.id === type.id ||
            rel.type.name === type.name ||
            (previousName != null && rel.type.name === previousName);
        if (matches) {
            return { ...rel, type: { ...type } };
        }
        return rel;
    });
}

/** Register a type from an edge copy into the catalog when missing. */
function ensureTypeInCatalog(db: Database, type: RelationshipType): RelationshipType {
    const byName = findTypeByName(db, type.name);
    if (byName) return byName;
    if (type.id != null) {
        const byId = findTypeById(db, type.id);
        if (byId) return byId;
    }
    const entry: RelationshipType = {
        ...type,
        id: type.id ?? db.nextTypeId++,
    };
    db.relationshipTypes.push(entry);
    return entry;
}

function resolveTypeForAdmin(db: Database, bodyId: number, name: string): RelationshipType | undefined {
    if (!Number.isNaN(bodyId)) {
        const byId = findTypeById(db, bodyId);
        if (byId) return byId;
    }
    if (!name) return undefined;
    const byName = findTypeByName(db, name);
    if (byName) return byName;
    const rel = db.relationships.find(r => r.type.name === name);
    if (rel) return ensureTypeInCatalog(db, rel.type);
    return undefined;
}

function findOrCreateType(
    db: Database,
    name: string,
    color = '#60a5fa',
    lineStyle = 'solid',
    displayLabel: string | null = null
): RelationshipType {
    const existing = findTypeByName(db, name);
    if (existing) return existing;
    const created: RelationshipType = {
        id: db.nextTypeId++,
        name,
        displayLabel,
        color,
        lineStyle,
        description: null,
    };
    db.relationshipTypes.push(created);
    return created;
}

function toCytoscapeGraph(db: Database) {
    return {
        elements: {
            nodes: db.entities.map(entity => ({
                data: {
                    id: String(entity.id),
                    label: entity.name,
                    type: entity.type,
                    color: entity.color || '#64748b',
                    description: entity.description,
                },
            })),
            edges: db.relationships.map(rel => ({
                data: {
                    id: `e${rel.id}`,
                    source: String(rel.source.id),
                    target: String(rel.target.id),
                    label: rel.type.displayLabel || rel.type.name,
                    color: rel.type.color || '#60a5fa',
                    width: 2,
                    relationshipType: rel.type.name,
                    lineStyle: rel.type.lineStyle || 'solid',
                },
            })),
        },
    };
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function textResponse(text: string, status = 200): Response {
    return new Response(text, { status, headers: { 'Content-Type': 'text/plain' } });
}

function parseBody(init?: RequestInit): Record<string, unknown> {
    if (!init?.body || typeof init.body !== 'string') return {};
    try {
        return JSON.parse(init.body) as Record<string, unknown>;
    } catch {
        return {};
    }
}

export function handleOfflineApi(pathname: string, method: string, init?: RequestInit): Response | null {
    const db = loadDb();

    if (pathname === '/graph' && method === 'GET') {
        return jsonResponse(toCytoscapeGraph(db));
    }

    if (pathname === '/graph' && method === 'DELETE') {
        const cleared = emptyDb();
        return persistOrFail(cleared, new Response(null, { status: 204 }));
    }

    if (pathname === '/entities' && method === 'GET') {
        return jsonResponse(db.entities);
    }

    if (pathname === '/entities' && method === 'POST') {
        const body = parseBody(init);
        const entity: Entity = {
            id: db.nextEntityId++,
            name: String(body.name ?? '').trim(),
            type: String(body.type ?? '').trim(),
            color: (body.color as string) || null,
            description: (body.description as string) || null,
        };
        db.entities.push(entity);
        return persistOrFail(db, jsonResponse(entity));
    }

    const entityMatch = pathname.match(/^\/entities\/(\d+)$/);
    if (entityMatch) {
        const id = Number(entityMatch[1]);
        if (method === 'PUT') {
            const body = parseBody(init);
            const index = db.entities.findIndex(e => e.id === id);
            if (index < 0) return textResponse('Entity not found', 404);
            const updated: Entity = {
                id,
                name: String(body.name ?? '').trim(),
                type: String(body.type ?? '').trim(),
                color: (body.color as string) || null,
                description: (body.description as string) || null,
            };
            db.entities[index] = updated;
            db.relationships = db.relationships.map(rel => ({
                ...rel,
                source: rel.source.id === id ? updated : rel.source,
                target: rel.target.id === id ? updated : rel.target,
            }));
            return persistOrFail(db, jsonResponse(updated));
        }
        if (method === 'DELETE') {
            const index = db.entities.findIndex(e => e.id === id);
            if (index < 0) return textResponse('Entity not found', 404);
            db.entities.splice(index, 1);
            db.relationships = db.relationships.filter(
                rel => rel.source.id !== id && rel.target.id !== id
            );
            return persistOrFail(db, textResponse('Entity deleted'));
        }
    }

    if (pathname === '/relationships' && method === 'GET') {
        return jsonResponse(db.relationships);
    }

    if (pathname === '/relationships' && method === 'POST') {
        const body = parseBody(init);
        const sourceId = Number(body.sourceId);
        const targetId = Number(body.targetId);
        const source = findEntity(db, sourceId);
        const target = findEntity(db, targetId);
        if (!source) return textResponse('Source entity not found', 404);
        if (!target) return textResponse('Target entity not found', 404);
        if (sourceId === targetId) return textResponse('Source and target must differ', 400);
        const typeName = String(body.typeName ?? '').trim();
        const relType = findOrCreateType(
            db,
            typeName,
            (body.color as string) || '#60a5fa',
            (body.lineStyle as string) || 'solid',
            (body.label as string) || null
        );
        const relationship: Relationship = {
            id: db.nextRelationshipId++,
            source: cloneEntity(source),
            target: cloneEntity(target),
            type: relType,
            label: null,
            weight: '1',
        };
        db.relationships.push(relationship);
        return persistOrFail(db, jsonResponse(relationship));
    }

    const relMatch = pathname.match(/^\/relationships\/(\d+)$/);
    if (relMatch) {
        const id = Number(relMatch[1]);
        const index = db.relationships.findIndex(r => r.id === id);
        if (index < 0) return textResponse('Relationship not found', 404);
        if (method === 'PUT') {
            const body = parseBody(init);
            const sourceId = Number(body.sourceId);
            const targetId = Number(body.targetId);
            const source = findEntity(db, sourceId);
            const target = findEntity(db, targetId);
            if (!source) return textResponse('Source entity not found', 404);
            if (!target) return textResponse('Target entity not found', 404);
            const typeName = String(body.typeName ?? '').trim();
            if (!typeName) return textResponse('Relationship type name is required', 400);
            const relType = findOrCreateType(
                db,
                typeName,
                (body.color as string) || '#60a5fa',
                (body.lineStyle as string) || 'solid',
                (body.label as string) || null
            );
            const updated: Relationship = {
                id,
                source: cloneEntity(source),
                target: cloneEntity(target),
                type: relType,
                label: null,
                weight: '1',
            };
            db.relationships[index] = updated;
            return persistOrFail(db, jsonResponse(updated));
        }
        if (method === 'DELETE') {
            db.relationships.splice(index, 1);
            return persistOrFail(db, textResponse('Relationship deleted'));
        }
    }

    if (pathname === '/relationship-types' && method === 'GET') {
        return jsonResponse(db.relationshipTypes);
    }

    if (pathname === '/relationship-types' && method === 'POST') {
        const body = parseBody(init);
        const name = String(body.name ?? '').trim();
        const bodyId = body.id != null ? Number(body.id) : NaN;
        const existing = resolveTypeForAdmin(db, bodyId, name);
        if (existing) {
            const previousName = existing.name;
            if (name) existing.name = name;
            if (body.displayLabel !== undefined) {
                existing.displayLabel = (body.displayLabel as string) || null;
            }
            if (body.color !== undefined) {
                existing.color = (body.color as string) || existing.color;
            }
            if (body.lineStyle !== undefined) {
                existing.lineStyle = (body.lineStyle as string) || existing.lineStyle;
            }
            const renamed = previousName !== existing.name;
            syncTypeOnRelationships(db, existing, renamed ? previousName : undefined);
            return persistOrFail(db, jsonResponse(existing));
        }
        if (!name) return textResponse('Type name is required', 400);
        const created: RelationshipType = {
            id: db.nextTypeId++,
            name,
            displayLabel: (body.displayLabel as string) || null,
            color: (body.color as string) || '#60a5fa',
            lineStyle: (body.lineStyle as string) || 'solid',
            description: (body.description as string) || null,
        };
        db.relationshipTypes.push(created);
        return persistOrFail(db, jsonResponse(created));
    }

    return null;
}
