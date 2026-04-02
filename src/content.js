async function injectHTML() {
    let urlParams = new URLSearchParams(window.location.search);
    const asyncId = urlParams.get("asyncId");

    if (!asyncId) return;

    fetch(`/services/data/v66.0/metadata/deployRequest/${asyncId}?includeDetails=true`, {
        headers: {
            Authorization: "Bearer " + getCookie("sid"),
        },
    })
        .then((res) => res.json())
        .then((data) => {
            let rows = data?.deployResult?.details?.componentSuccesses;
            if (!rows) return;
            rows = rows.filter((row) => row.fullName != "package.xml" && !(row.fullName == "destructiveChanges.xml" && row.problemType == "Warning"));
            if (rows.length < 1) return;

            const table = jsonToTable(rows);
            const injectionSelector = "#" + CSS.escape("MonitorDeploymentsDetailsPage:detailsForm");
            document.querySelector(injectionSelector).appendChild(table);
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
}

function jsonToTable(data) {
    if (!data || !data.length) return "";

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
    data.forEach((row, index) => {
        const tr = document.createElement("tr");
        tr.classList.add("dataRow");

        // Row index column
        const td = document.createElement("td");
        td.classList.add("dataCell");
        td.textContent = `${index + 1}.`;
        tr.appendChild(td);

        headers.forEach((h, index) => {
            const td = document.createElement("td");
            td.classList.add("dataCell");
            if (index == 0 && row[h]) {
                // Linkify the record Id column
                td.innerHTML = `<a href="/${row[h]}">${row[h]}</a>`;
            } else if (index == 1) {
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

injectHTML();
