const SF_API_VERSION = "v67.0";

let objectIdMap = {};
let omniStudioIdMap = {};

async function injectHTML() {
    const urlParams = new URLSearchParams(window.location.search);
    const asyncId = urlParams.get("asyncId");

    if (!asyncId) return;

    const sid = getCookie("sid");
    if (!sid) return;

    const injectionSelector = "#" + CSS.escape("MonitorDeploymentsDetailsPage:detailsForm");

    const deploymentPromise = fetchDeploymentData(asyncId, sid);
    const objectIdMapPromise = fetchObjectIdMap(sid);

    const [data, target] = await Promise.all([deploymentPromise, waitForElement(injectionSelector)]);
    if (!data || !target) return;

    const result = data?.deployResult;
    let rows = result?.details?.componentSuccesses;
    const AreComponentsActuallyChanged = !result.checkOnly && result.done && result.success;
    if (!rows) return;
    rows = rows.filter((row) => row.fullName !== "package.xml" && !(row.fullName === "destructiveChanges.xml" && row.problemType === "Warning"));
    if (rows.length < 1) return;

    const table = jsonToTable(rows, AreComponentsActuallyChanged);
    if (!table) return;
    target.appendChild(table);

    const omniStudioMapPromise = fetchOmniStudioIds(sid, rows);
    const [resolvedObjectIdMap, resolvedOmniStudioMap] = await Promise.all([objectIdMapPromise, omniStudioMapPromise]);
    objectIdMap = resolvedObjectIdMap;
    omniStudioIdMap = resolvedOmniStudioMap;
    updateLinks(table, rows);
}

async function fetchDeploymentData(asyncId, sid) {
    try {
        const res = await fetch(`${getOrigin()}/services/data/${SF_API_VERSION}/metadata/deployRequest/${asyncId}?includeDetails=true`, {
            headers: {
                Authorization: "Bearer " + sid,
            },
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

async function fetchObjectIdMap(sid) {
    const query = encodeURIComponent("SELECT QualifiedApiName, DurableId, KeyPrefix FROM EntityDefinition WHERE DurableId LIKE '0%'");
    try {
        const res = await fetch(`${getOrigin()}/services/data/${SF_API_VERSION}/tooling/query?q=${query}`, {
            headers: {
                Authorization: "Bearer " + sid,
            },
        });
        if (!res.ok) return {};
        const data = await res.json();
        return Object.fromEntries(
            (data.records || [])
                .filter((r) => r.QualifiedApiName.endsWith("__c") || r.QualifiedApiName.endsWith("__mdt"))
                .map((r) => [r.QualifiedApiName, [r.DurableId, r.KeyPrefix]]),
        );
    } catch {
        return {};
    }
}

async function fetchOmniStudioIds(sid, rows) {
    const groups = { OmniScript: [], OmniIntegrationProcedure: [], OmniUiCard: [], OmniDataTransform: [] };
    for (const row of rows) {
        if (row.componentType in groups) groups[row.componentType].push(row.fullName);
    }

    const map = {};
    const queries = [];

    if (groups.OmniScript.length > 0) {
        queries.push(
            soqlQuery(sid, `SELECT Id, UniqueName FROM OmniProcess WHERE OmniProcessType = 'OmniScript'`).then((records) =>
                records.forEach((r) => {
                    map[`OmniScript:${r.UniqueName}`] = r.Id;
                }),
            ),
        );
    }
    if (groups.OmniIntegrationProcedure.length > 0) {
        queries.push(
            soqlQuery(sid, `SELECT Id, UniqueName FROM OmniProcess WHERE OmniProcessType = 'Integration Procedure'`).then((records) =>
                records.forEach((r) => {
                    map[`OmniIntegrationProcedure:${r.UniqueName}`] = r.Id;
                }),
            ),
        );
    }
    if (groups.OmniUiCard.length > 0) {
        queries.push(
            soqlQuery(sid, `SELECT Id, UniqueName FROM OmniUiCard`).then((records) =>
                records.forEach((r) => {
                    map[`OmniUiCard:${r.UniqueName}`] = r.Id;
                }),
            ),
        );
    }
    if (groups.OmniDataTransform.length > 0) {
        queries.push(
            soqlQuery(sid, `SELECT Id, UniqueName FROM OmniDataTransform`).then((records) =>
                records.forEach((r) => {
                    map[`OmniDataTransform:${r.UniqueName}`] = r.Id;
                }),
            ),
        );
    }

    await Promise.all(queries);
    return map;
}

async function soqlQuery(sid, soql) {
    try {
        const res = await fetch(`${getOrigin()}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`, {
            headers: { Authorization: "Bearer " + sid },
        });
        if (!res.ok) return [];
        return (await res.json()).records || [];
    } catch {
        return [];
    }
}

function waitForElement(selector) {
    return new Promise((resolve) => {
        const el = document.querySelector(selector);
        if (el) {
            resolve(el);
            return;
        }

        const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
                observer.disconnect();
                resolve(el);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, 60000);
    });
}

function getCookie(name) {
    const cookies = document.cookie.split("; ");

    for (const c of cookies) {
        const [key, value] = c.split("=");

        if (key === name) {
            return value;
        }
    }
    return null;
}

function getOrigin() {
    return window.location.origin.replace(`salesforce-setup`, `salesforce`);
}

function jsonToTable(data, AreComponentsActuallyChanged) {
    if (!data || !data.length) return null;

    const page = document.createElement("div");
    page.classList.add("apexp");

    const container = document.createElement("div");
    container.classList.add("bPageBlock", "brandSecondaryBrd", "apexDefaultPageBlock", "secondaryPalette");

    const header = document.createElement("div");
    header.classList.add("pbHeader");
    header.innerHTML = `<table border="0" cellpadding="0" cellspacing="0" role="presentation"><tbody><tr><td class="pbTitle"><h2 class="mainTitle">Component Successes</h2></td><td>&nbsp;</td></tr></tbody></table>`;

    const body = document.createElement("div");
    body.classList.add("pbBody");

    const table = document.createElement("table");
    table.classList.add("list", "testFailuresTable");

    const headers = [
        "id",
        "State",
        "fullName",
        "componentType",
        "fileName",
        // "problemType",
        // "problem",
    ];
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.classList.add("headerRow");

    // Row index column
    const th = document.createElement("th");
    th.classList.add("headerRow");
    headerRow.appendChild(th);

    headers.forEach((h) => {
        const th = document.createElement("th");
        th.classList.add("headerRow");
        th.textContent = camelToSentence(h);
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    data.forEach((row, rowIndex) => {
        const tr = document.createElement("tr");
        tr.classList.add("dataRow");

        // Row index column
        const td = document.createElement("td");
        td.classList.add("dataCell");
        td.textContent = `${rowIndex + 1}.`;
        tr.appendChild(td);

        headers.forEach((h, colIndex) => {
            const td = document.createElement("td");
            td.classList.add("dataCell");
            if (colIndex === 0 && (!row.created || AreComponentsActuallyChanged) && (!row.deleted || !AreComponentsActuallyChanged)) {
                // Linkify the record Id column; data-row-index allows async href updates via updateLinks()
                const link = getLinkForRow(row);
                if (link) {
                    const a = document.createElement("a");
                    a.href = link;
                    a.textContent = row[h] || "View";
                    a.dataset.rowIndex = rowIndex;
                    td.appendChild(a);
                } else {
                    td.textContent = row[h];
                }
            } else if (colIndex === 1) {
                // Calculate the State column
                td.textContent = getState(row);
            } else {
                td.textContent = row[h];
            }
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    body.appendChild(table);
    container.appendChild(header);
    container.appendChild(body);
    page.appendChild(container);

    return page;
}

function updateLinks(table, rows) {
    table.querySelectorAll("a[data-row-index]").forEach((a) => {
        const row = rows[parseInt(a.dataset.rowIndex)];
        if (row) {
            const link = getLinkForRow(row);
            if (link) a.href = link;
            if (row.id) a.textContent = row.id;
        }
    });
}

function camelToSentence(text) {
    if (!text) return "";

    const result = text
        .replace(/([A-Z])/g, " $1") // add space before capital letters
        .trim();

    return result.charAt(0).toUpperCase() + result.slice(1);
}

function getState(row) {
    if (row.created) {
        return "Created";
    } else if (row.deleted) {
        return "Deleted";
    } else if (row.changed) {
        return "Changed";
    } else if (!row.success) {
        return "Failed";
    }
    return "Unchanged";
}

function getLinkForRow(row) {
    switch (row.componentType) {
        case "BusinessProcess": {
            return `/lightning/setup/CaseProcess/page?address=%2Fsetup%2Fui%2Fbpfields.jsp%3Fid%3D${row.id}`;
        }
        case "CallCenter": {
            return `/lightning/setup/CallCenters/page?address=%2F_ui%2Fcti%2Fcallcenter%2FCallCenter%2Fd%3Fid%3D${row.id}`;
        }
        case "CompactLayout": {
            // fullName: "ObjectName.CompactLayoutName"
            const parts = row.fullName.split(".");
            row.id = row.id ?? parts[1];
            return `/lightning/setup/ObjectManager/${getObjectId(parts[0])}/CompactLayouts/${row.id}/view`;
        }
        case "ConnectedApp": {
            // the Id observed isn't a Connected App Id, Example: 09HHu000000XXXXXXX
            row.id = "App Manager";
            return `/lightning/setup/NavigationMenus/home`;
        }
        case "CustomApplication": {
            return `/visualEditor/appBuilder.app?id=${row.id}`;
        }
        case "CustomField": {
            // fullName: "ObjectName.FieldName"
            const parts = row.fullName.split(".");
            row.id = row.id ?? parts[1];
            if (parts[0].endsWith("__mdt")) {
                return `/lightning/setup/CustomMetadata/page?address=%2F${row.id}`;
            }
            return `/lightning/setup/ObjectManager/${getObjectId(parts[0])}/FieldsAndRelationships/${row.id}/view`;
        }
        case "CustomNotificationType": {
            return `/lightning/setup/CustomNotifications/${row.id}/detail`;
        }
        case "CustomObject": {
            if (row.fullName.endsWith("__mdt")) {
                return `/lightning/setup/CustomMetadata/page?address=%2F${getObjectId(row.fullName)}`;
            }
            return `/lightning/setup/ObjectManager/${row.id ?? row.fullName}/Details/view`;
        }
        case "CustomMetadata": {
            return `/lightning/setup/CustomMetadata/page?address=%2F${row.id}`;
        }
        case "FieldSet": {
            // fullName: "ObjectName.FieldSetName"
            const objectName = row.fullName.split(".")[0];
            return `/lightning/setup/ObjectManager/${getObjectId(objectName)}/FieldSets/${row.id}/view`;
        }
        case "Group": {
            return `/lightning/setup/PublicGroups/page?address=%2Fsetup%2Fown%2Fgroupdetail.jsp%3Fid%3D${row.id}`;
        }
        case "Layout": {
            // fullName: "ObjectName-LayoutName"
            const objectName = row.fullName.split("-")[0];
            if (objectName.endsWith("__mdt")) {
                const address = encodeURIComponent(`/layouteditor/layoutEditor.apexp?type=${getObjectId(objectName)}&lid=${row.id}`);
                return `/lightning/setup/CustomMetadata/page?address=${address}`;
            }
            return `/lightning/setup/ObjectManager/${getObjectId(objectName)}/PageLayouts/${row.id}/view`;
        }
        case "ListView": {
            // fullName: "ObjectName.ListViewApiName"
            const parts = row.fullName.split(".");
            if (parts.length !== 2) return `/${row.id}`;
            if (parts[0].endsWith("__mdt")) {
                const keyPrefix = getKeyPrefix(parts[0]);
                return `/lightning/setup/CustomMetadata/page?address=%2F${keyPrefix}%3Ffcf%3D${row.id}`;
            }
            return `/lightning/o/${parts[0]}/list?filterName=${parts[1]}`;
        }
        case "MatchingRules": {
            row.id = "Matching Rules";
            return `/lightning/setup/MatchingRules/home`;
        }
        case "ExperienceBundle":
        case "Network":
        case "NavigationMenu":
        case "NetworkBranding": {
            row.id = "All Sites";
            return `/lightning/setup/SetupNetworks/home`;
        }
        case "OmniScript": {
            row.id = omniStudioIdMap[`OmniScript:${row.fullName}`] || row.id;
            return `/builder_omnistudio/omnistudioBuilder.app?type=omniscript&id=${row.id}`;
        }
        case "OmniIntegrationProcedure": {
            row.id = omniStudioIdMap[`OmniIntegrationProcedure:${row.fullName}`] || row.id;
            return `/builder_industries_interaction_rule/industriesBuilder.app?recordId=${row.id}`;
        }
        case "OmniUiCard": {
            row.id = omniStudioIdMap[`OmniUiCard:${row.fullName}`] || row.id;
            return `/builder_omnistudio/omnistudioBuilder.app?type=flexcard&id=${row.id}`;
        }
        case "OmniDataTransform": {
            row.id = omniStudioIdMap[`OmniDataTransform:${row.fullName}`] || row.id;
            return `/builder_omnistudio/omnistudioBuilder.app?type=dataraptor&id=${row.id}`;
        }
        case "PathAssistant": {
            return `/setup_sales_pathassistant/paSetupWizard.app?pathAssistantId=${row.id}`;
        }
        case "PlatformEventChannel":
        case "PlatformEventChannelMember": {
            return null;
        }
        case "Queue": {
            return `/lightning/setup/Queues/page?address=%2Fp%2Fown%2FQueue%2Fd%3Fid%3D${row.id}`;
        }
        case "RecordType": {
            // fullName: "ObjectName.RecordTypeName"
            const objectName = row.fullName.split(".")[0];
            return `/lightning/setup/ObjectManager/${getObjectId(objectName)}/RecordTypes/${row.id}/view`;
        }
        case "ReportType": {
            return `/lightning/setup/CustomReportTypeLightning/${row.id}/view`;
        }
        case "SharingCriteriaRule":
        case "SharingOwnerRule":
        case "SharingRules": {
            row.id = "Sharing Settings";
            return `/lightning/setup/SecuritySharing/home`;
        }
        case "SharingReason": {
            // not supported in Lightning
            return null;
        }
        case "StandardValueSet": {
            row.id = row.id ?? row.fullName;
            return null;
        }
        case "ValidationRule": {
            // fullName: "ObjectName.RuleName"
            const objectName = row.fullName.split(".")[0];
            if (objectName.endsWith("__mdt")) {
                return `/lightning/setup/CustomMetadata/page?address=%2F${row.id}`;
            }
            return `/lightning/setup/ObjectManager/${getObjectId(objectName)}/ValidationRules/${row.id}/view`;
        }
        case "QuickAction":
        case "WebLink": {
            // fullName: "ObjectName.LinkName"
            const objectName = row.fullName.split(".")[0];
            return `/lightning/setup/ObjectManager/${getObjectId(objectName)}/ButtonsLinksActions/${row.id}/view`;
        }
        default:
            return `/${row.id}`;
    }
}

function getObjectId(objectName) {
    return objectIdMap[objectName]?.[0] || objectName;
}

function getKeyPrefix(objectName) {
    return objectIdMap[objectName]?.[1] || objectName;
}

injectHTML();
