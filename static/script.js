document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('image-input');
    const analyzeBtn = document.getElementById('analyze-btn');
    const resultsContainer = document.getElementById('results-container');
    const spinner = document.getElementById('spinner');

    analyzeBtn.addEventListener('click', async () => {
        const file = imageInput.files[0];
        if (!file) {
            alert('Please select an image file.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        spinner.classList.remove('hidden');
        resultsContainer.innerHTML = '';

        try {
            const response = await fetch('/api/analyze-image', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (result.error) {
                resultsContainer.innerHTML = `<p>Error: ${result.error}</p>`;
                if (result.raw_response) {
                    resultsContainer.innerHTML += `<p>Raw Response: <pre>${result.raw_response}</pre></p>`;
                }
            } else {
                displayResults(result);
            }

        } catch (error) {
            resultsContainer.innerHTML = `<p>An unexpected error occurred: ${error.message}</p>`;
        } finally {
            spinner.classList.add('hidden');
        }
    });

    function displayResults(data) {
        const { bom, total_cost } = data;

        let tableHtml = `
            <h2>Bill of Materials</h2>
            <table>
                <thead>
                    <tr>
                        <th>Object</th>
                        <th>Part</th>
                        <th>Material</th>
                        <th>Estimated Cost (USD)</th>
                    </tr>
                </thead>
                <tbody>
        `;

        bom.forEach(item => {
            tableHtml += `
                <tr>
                    <td>${item.object}</td>
                    <td>${item.part}</td>
                    <td>${item.material}</td>
                    <td>$${item.cost.toFixed(2)}</td>
                </tr>
            `;
        });

        tableHtml += `
                </tbody>
            </table>
            <h3>Total Estimated Cost: $${total_cost.toFixed(2)}</h3>
        `;

        resultsContainer.innerHTML = tableHtml;
    }
});
