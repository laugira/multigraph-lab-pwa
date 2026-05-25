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

function saveDb(db: Database) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
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
        saveDb(cleared);
        return new Response(null, { status: 204 });
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
        saveDb(db);
        return jsonResponse(entity);
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
            saveDb(db);
            return jsonResponse(updated);
        }
        if (method === 'DELETE') {
            const index = db.entities.findIndex(e => e.id === id);
            if (index < 0) return textResponse('Entity not found', 404);
            db.entities.splice(index, 1);
            db.relationships = db.relationships.filter(
                rel => rel.source.id !== id && rel.target.id !== id
            );
            saveDb(db);
            return textResponse('Entity deleted');
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
        saveDb(db);
        return jsonResponse(relationship);
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
            const relType = findTypeByName(db, typeName);
            if (!relType) return textResponse(`Relationship type '${typeName}' not found`, 404);
            const updated: Relationship = {
                id,
                source: cloneEntity(source),
                target: cloneEntity(target),
                type: relType,
                label: null,
                weight: '1',
            };
            db.relationships[index] = updated;
            saveDb(db);
            return jsonResponse(updated);
        }
        if (method === 'DELETE') {
            db.relationships.splice(index, 1);
            saveDb(db);
            return textResponse('Relationship deleted');
        }
    }

    if (pathname === '/relationship-types' && method === 'GET') {
        return jsonResponse(db.relationshipTypes);
    }

    if (pathname === '/relationship-types' && method === 'POST') {
        const body = parseBody(init);
        const name = String(body.name ?? '').trim();
        const existing = findTypeByName(db, name);
        if (existing) {
            existing.displayLabel = (body.displayLabel as string) || existing.displayLabel;
            existing.color = (body.color as string) || existing.color;
            existing.lineStyle = (body.lineStyle as string) || existing.lineStyle;
            saveDb(db);
            return jsonResponse(existing);
        }
        const created: RelationshipType = {
            id: db.nextTypeId++,
            name,
            displayLabel: (body.displayLabel as string) || null,
            color: (body.color as string) || '#60a5fa',
            lineStyle: (body.lineStyle as string) || 'solid',
            description: (body.description as string) || null,
        };
        db.relationshipTypes.push(created);
        saveDb(db);
        return jsonResponse(created);
    }

    return null;
}
