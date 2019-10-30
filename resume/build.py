#!/usr/bin/env python

from __future__ import print_function

import logging
import os
import sys
from subprocess import PIPE, STDOUT, Popen

import yaml

if any(opt in sys.argv for opt in ('-h', '--help')):
    print('usage: ./build.py [--real]')
    sys.exit(0)

logging.basicConfig(level=logging.DEBUG)
log = logging.getLogger()

BUILD_REAL = '--real' in sys.argv
BUILD_DIGITAL = '--digital' in sys.argv
CONF_FILE = 'resume.yaml'

try:
    conf = yaml.load(open(os.path.join(os.curdir, CONF_FILE), 'rb'))
except:
    log.exception('error: unable to read {} config file:'.format(CONF_FILE))
    raise

# real header has my real name and address, etc...
if BUILD_REAL:
    REAL_HEADER = conf['real_header']

# anonymized header
ANON_HEADER = r"""
\begin{center}
    \hspace{-1.5cm}\Huge\textbf{Lexical Unit}
\end{center}
\vspace{-.2in}
\begin{tabular*}{7.0in}{l@{\extracolsep{\fill}}r}
    \hspace{-1.5cm}Portland, OR & \href{mailto:resume@lexicalunit.com}{resume@lexicalunit.com} \\
\end{tabular*}
\hrulefill
"""

# digital optimization (vs the default: print optimization)
DIGITAL_PREAMBLE = r"""
% sans-serif font is better for digital, but serif is better for print
\usepackage{gillius}
\renewcommand{\familydefault}{\sfdefault}
"""

# generate LaTeX source
with open("resume.tex", "r") as f:
    data = f.read()
    if BUILD_REAL:
        data = data.replace("% <Header>", REAL_HEADER)
    else:
        data = data.replace("% <Header>", ANON_HEADER)

    if BUILD_DIGITAL:
        data = data.replace("% <Digital>", DIGITAL_PREAMBLE)

    if not BUILD_REAL:
        lines = data.split('\n')
        for lineno, line in enumerate(lines):
            if line.startswith('\date'):
                lines[lineno] = r'\dates{}'
            elif line.startswith('\location'):
                lines[lineno] = r'\location{}'
            elif 'University' in line:
                lines[lineno] = r'\employer{\textbf{School}}'
            elif line.startswith('\employer'):
                lines[lineno] = r'\employer{\textbf{Workplace}}'
        data = '\n'.join(lines)
print(data, file=open("built.tex", "w"))

# run LaTeX processing
p = Popen(['/Library/TeX/texbin/pdflatex', '--file-line-error' '--synctex=1'],
          stdout=PIPE, stdin=PIPE, stderr=STDOUT)
out, err = p.communicate(input=data.encode("utf-8"))

# show LaTeX processing output
print(out)
if err:
    print(err, file=sys.stderr)

# sanity check
assert os.path.isfile('texput.pdf')

# cleanup
os.remove('texput.log')

# output
OUTPUT = os.path.expanduser(conf['real_resume_install_path'] if BUILD_REAL else 'aresume.pdf')
if BUILD_DIGITAL:
    OUTPUT = OUTPUT[:-4] + '-digital' + OUTPUT[-4:]
os.rename('texput.pdf', OUTPUT)
print('built {}'.format(OUTPUT))
