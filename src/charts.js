// Espone ApexCharts come globale così lo script classico dell'app può creare
// grafici con new window.ApexCharts(...). La libreria è bundlata da Vite.
import ApexCharts from 'apexcharts';
window.ApexCharts = ApexCharts;
