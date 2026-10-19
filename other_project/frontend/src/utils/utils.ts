export const areObjectsDifferent = (obj1: any, obj2: any) => {
    // If both are the same reference or primitive value
    if (obj1 === obj2) {
        return false; // No difference
    }

    if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 === null || obj2 === null) {
        return true;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
        return true;
    }

    // Check each key recursively
    for (const key of keys1) {
        if (!keys2.includes(key) || areObjectsDifferent(obj1[key], obj2[key])) {
            return true;
        }
    }

    return false;
};

// Function for securely generating Azure Blob Storage SAS URLs.
// Requests a temporary, read-only SAS URL for a given blob in a specified container by calling the backend endpoint `/generate_sas_url`.
// Logic is within this shared utility file for reusability across app components.
export const getSasUrl = async (container: string, blob: string): Promise<string | null> => {
    try {
        const response = await fetch('/generate_sas_url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ container, blob }),
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.sas_url;
    } catch {
        return null;
    }
};
