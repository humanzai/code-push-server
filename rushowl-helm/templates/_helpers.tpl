{{/*
Common labels
*/}}
{{- define "rushowl-helm.labels" -}}
helm.sh/chart: {{ include "rushowl-helm.chart" . }}
{{ include "rushowl-helm.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "rushowl-helm.selectorLabels" -}}
app.kubernetes.io/name: {{ include "rushowl-helm.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
